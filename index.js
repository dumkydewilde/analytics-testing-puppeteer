const functions = require('firebase-functions');
const puppeteer = require('puppeteer');

const requestUrlParamsToJSON = requestURL => {
    // Helper function to split request parameters and store as key-value object for easy access
    let params = requestURL.split('?')[1];
    return JSON.parse('{"' + decodeURI(params).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
}

// Tests that we can run at certain steps
const tests = {
    requestMatchRegex: (requestsObject, testKey, testValue) => {
        console.log(JSON.stringify(requestsObject));
        try {
            const matchRegex = requestsObject.map(item => {
                // If the parameter exists, test for a matching value
                if (item.hasOwnProperty(testKey)) {
                    const regex = new RegExp(testValue);

                    if (item[testKey].match(regex) != null) {
                        return true
                    }
                } else {
                    return false
                }
            });

            return matchRegex.indexOf(true) > -1 ? "PASS" : "FAIL"

        } catch (e) {
            return e
        }
    }
}

exports.runTest = functions.https.onRequest(async(req, res) => {
    // Accept a JSON object with test sequence as input
    if (req.method !== "POST") {
        res.status(400).send("Invalid request method");
    }

    let results = [];

    const testObject = req.body.test;
    const options = req.body.options;

    if (typeof(testObject) !== "object") {
        res.status(400).send("Invalid test sequence");
    }
    if (options && typeof(options) !== "object") {
        res.status(400).send("Invalid options");
    }

    const browser = await puppeteer.launch({ headless: options.headless || false });

    // Open new page in browser for the test to run
    const page = await browser.newPage();

    let networkRequests = {};
    if (options.trackRequests) {
        // Turn on request interception to track hits and parameters for e.g. Google Analytics
        await page.setRequestInterception(true);

        // Create an empty array for each domain we want to track to push to
        options.trackRequests.forEach(tracker => {
            networkRequests[tracker.name] = [];
        });

        page.on('request', req => {
            // Determine what to do with every request and create an object with the request params when needed
            const requestURL = req.url();
            let abortRequest = false;
            options.trackRequests.forEach(tracker => {
                if (requestURL.indexOf(tracker.url) > -1) {
                    networkRequests[tracker.name].push(requestUrlParamsToJSON(requestURL));
                    if (tracker.abortRequest) {
                        abortRequest = true;
                    }
                }
            });
            abortRequest ? req.abort() : req.continue();
        });
    }

    // Execute the steps you want to take e.g. go to page, click element, type text, wait, etc. one by one
    try {
        // Go over every step one by one
        for (let i = 0; i < testObject.steps.length; i++) {
            let step = testObject.steps[i];

            // Execute the right step action
            switch (step.action) {
                case "goto":
                    console.log("### Go to page: " + step.value);
                    await page.goto(step.value, { waitUntil: 'networkidle0' });
                    await page.waitFor(1000);
                    break;

                case "click":
                    console.log("### Click element: " + step.element);

                    // Wait for the element to appear on screen (useful for asynchronicity)
                    await page.waitFor(step.element);

                    // Use page.evaluate because it's more consisten than page.click()
                    await page.evaluate((e) => {
                        document.querySelector(e).click();
                    }, step.element);
                    await page.waitFor(1000);
                    break;

                case "wait":
                    await page.waitFor(step.value);
                    console.log("### Waiting for: " + step.value);
                    break;

                case "type":
                    await page.waitFor(step.element);
                    if (step.clear) {
                        await page.evaluate((e) => {
                            document.querySelector(e).value = ""
                        }, step.element);
                    }
                    await page.type(step.element, step.value, { delay: 200 });
                    console.log("### Typing '" + step.value + "' - on DOM element: " + step.element);
                    break;

                case "test":
                    console.log('### testing: ' + step.test.name)

                    // TEST A: check whether a request parameter matches a value
                    if (step.test.type == "requestMatchRegex") {
                        // Test for request to regex match a value
                        try {
                            // Look at all request objects in the array or only the last one
                            const requestsObject = step.test.options.matchAnyRequest === true ? networkRequests[step.test.for] : [networkRequests[step.test.for][networkRequests[step.test.for].length - 1]];
                            console.log(step.test.options.matchAnyRequest === true, typeof(step.test.options.matchAnyRequest));

                            // Log a PASS or FAIL for the test
                            results.push({
                                test: {
                                    id: step.test.id,
                                    name: step.test.name,
                                    result: tests.requestMatchRegex(requestsObject, step.test.match.key, step.test.match.value)
                                }
                            });
                        } catch (e) {
                            console.error(e);
                        }
                    }

                    // TEST B: check wheter a dataLayer event key matches a specific value
                    if (step.test.type == "matchDataLayerKeyValue") {
                        try {
                            // Get the current dataLayer
                            const pageDataLayer = await page.evaluate(() => dataLayer);

                            // Check for existence of a key / value pair in the datalayer
                            const result = await pageDataLayer.find(x => x[step.test.key] == step.test.value);

                            results.push({
                                test: {
                                    id: step.test.id,
                                    name: step.test.name,
                                    result: result === undefined ? "FAIL" : "PASS"
                                }
                            });

                        } catch (e) {
                            console.error(e);
                        }
                    }

                    break;

                default:
                    console.log("This step is not recognised, please use a valid step in your test.");
            }
        }
    } catch (e) {
        // Make sure the browser is closed, even on time-outs 
        browser.close();
        res.status(400).send(e);
        throw e;
    }
    browser.close();
    res.status(200).send(results);
});