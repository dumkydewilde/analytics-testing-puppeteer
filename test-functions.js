const axios = require('axios');
const ENDPOINT = "http://localhost:5001/YOUR_PROJECT_NAME/us-central1/runTest";

const test1 = {
    "name": "Demo Store Tests",
    "steps": [{
            "action": "goto",
            "value": "https://enhancedecommerce.appspot.com/"
        },
        {
            "action": "test",
            "test": {
                "id": "1",
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
                "id": "2",
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

axios.post(ENDPOINT, {
        test: test1,
        options: options
    })
    .then((res) => {
        console.log(`statusCode: ${res.status}`)
        console.log(res.data)
    })
    .catch((error) => {
        console.error(error)
    })