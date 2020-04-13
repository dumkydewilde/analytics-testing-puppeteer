const puppeteer = require('puppeteer');

const runTest = async(testObject, options = { headless: true }) => {
    /*
     * Run a single test from a browser and test sequence
     * 
     */

    const browser = await puppeteer.launch({ headless: options.headless });

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

        const requestUrlParamsToJSON = requestURL => {
            // Split request parameters and store as key-value object for easy access
            let params = requestURL.split('?')[1];
            return JSON.parse('{"' + decodeURI(params).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
        }

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

                    // TEST A: check whether a request parameter matches a value
                    if (step.test.type == "requestMatchRegex") {
                        // Test for request to regex match a value
                        try {
                            // Look at all request objects in the array or only the last one
                            const testObject = step.test.options.matchAnyRequest == true ? networkRequests[step.test.for] : [networkRequests[step.test.for][networkRequests[step.test.for].length - 1]];
                            const matchRegex = testObject.map(item => {

                                // If the parameter exists, test for a matching value
                                if (item.hasOwnProperty(step.test.match.key)) {
                                    const regex = new RegExp(step.test.match.value);

                                    if (item[step.test.match.key].match(regex) != null) {
                                        return true
                                    }
                                } else {
                                    return false
                                }
                            });

                            // Log a PASS or FAIL for the test
                            console.log({
                                test: {
                                    name: step.test.name,
                                    result: matchRegex.indexOf(true) > -1 ? "PASS" : "FAIL"
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
                            const pageDataLayer = await page.evaluate(() => dataLayer)

                            // Check for existence of a key / value pair in the datalayer
                            const result = await pageDataLayer.find(x => x[step.test.key] == step.test.value);

                            console.log({
                                test: {
                                    name: step.test.name,
                                    result: result === undefined ? "FAIL" : "PASS"
                                }
                            });

                        } catch {
                            console.error(e);
                        }
                    }

                    break;

                default:
                    console.log("This step is not recognised, please use a valid step in your test.");
            }
        };
    } catch (e) {
        // Make sure the browser is closed, even on time-outs 
        browser.close();
        throw e;
    }
    browser.close();

};

const test1 = {
    "name": "Demo Store Tests",
    "steps": [{
            "action": "goto",
            "value": "https://enhancedecommerce.appspot.com/"
        },
        {
            "action": "test",
            "test": {
                "name": "Product on homepage",
                "description": "Check whether the first product's ID on the homepage matches the general format for product ID's",
                "for": "GoogleAnalytics",
                "type": "requestMatchRegex",
                "match": {
                    "key": "il1pi1id",
                    "value": "[a-z0-9]{5}"
                },
                "options": {
                    "matchAnyRequest": true
                }
            }
        },
        {
            "action": "click",
            "element": ".thumbnail a.itemLink"
        },
        {
            "action": "wait",
            "value": 1000
        },
        {
            "action": "click",
            "element": "#addToCart"
        },
        {
            "action": "test",
            "test": {
                "name": "Google Analytics Add to Cart event",
                "description": "Clicking add to cart on product detail page",
                "for": "GoogleAnalytics",
                "type": "requestMatchRegex",
                "match": {
                    "key": "ea",
                    "value": "add_to_cart"
                },
                "options": {
                    "matchAnyRequest": true
                }
            }
        }
    ]
};

const test2 = {
    name: "Demo Store Tests: Typing",
    steps: [{
            action: "goto",
            value: "https://enhancedecommerce.appspot.com/checkout"
        },
        {
            action: "click",
            element: "#start-customerInfo"
        },
        {
            action: "type",
            element: "#first_name",
            value: "Jason",
            clear: true
        },
        {
            action: "type",
            element: "#last_name",
            value: "Bourne",
            clear: true
        }
    ]

};

const options = {
    trackRequests: [{
            name: 'GoogleAnalytics',
            url: 'www.google-analytics.com/collect',
            abortRequest: true
        },
        {
            name: 'Facebook',
            url: 'www.facebook.com/tr',
            abortRequest: true
        },
    ],

    headless: false
};

runTest(test1, options).catch(e => { console.log(e) });
