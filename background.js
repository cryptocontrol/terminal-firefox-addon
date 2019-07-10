const allowedOrigins = [
    'https://terminal-test.cryptocontrol.io',
    'https://terminal.cryptocontrol.io',
    'http://localhost:3000'
]

function messagePageScript() {
  window.postMessage({
    direction: 'from-content-script',
    message: 'Message from the content script'
  }, "*")
}


var CCIO = {
    enabled: false,
    activationWhitelistEnabled: false,

    // holds user prefs
    prefs: {},

    // contains requests/responses
    transactions: {},

    init: function () {
        // toggle activation on button click
        browser.browserAction.onClicked.addListener(function () { CCIO.toggle(); });

        // load prefs
        CCIO.loadPrefs(function () {
            // enact enabled at startup
            if (CCIO.prefs.enabledAtStartup) CCIO.toggle(true);

            // update button
            CCIO.updateButton();
        });

        return this;
    },


    toggle: function(state) {
        // set state by input
        if (typeof state === 'boolean') CCIO.enabled = state;

        // set state by toggle
        else CCIO.enabled = !CCIO.enabled;

        // update button
        CCIO.updateButton();

        // clear transactions
        CCIO.transactions = {};

        // add observer, observe http responses
        if (CCIO.enabled) {

						messagePageScript()
						
            browser.webRequest.onBeforeSendHeaders.addListener(
                CCIO.requestHandler, { urls: ["<all_urls>"] }, ["blocking", "requestHeaders"]
            );

            browser.webRequest.onHeadersReceived.addListener(
                CCIO.responseHandler, { urls: ["<all_urls>"] }, ["blocking", "responseHeaders"]
            );
        }

        // remove observer
        else {
            browser.webRequest.onBeforeSendHeaders.removeListener(CCIO.requestHandler);
            browser.webRequest.onHeadersReceived.removeListener(CCIO.responseHandler);
        }

        return this;
    },


    /**
     * re/load preferences Because fetching prefs returns a promise, we use a
     * callback to do stuff when the promise is fullfilled.
     *
     * @param {*} callback
     */
    loadPrefs: function(callback) {
        browser.storage.sync.get([
            'activationWhitelist', 'enabledAtStartup', 'staticOrigin'
        ]).then((res) => {
            // get prefs, set default value if n/a
            CCIO.prefs.enabledAtStartup = res.enabledAtStartup || false;
            CCIO.prefs.staticOrigin = res.staticOrigin || '';
            CCIO.prefs.activationWhitelist = res.activationWhitelist || '';

            // parse activation whitelist
            CCIO.prefs.activationWhitelist = CCIO.prefs.activationWhitelist ?
                CCIO.prefs.activationWhitelist.split(/[\r\n]+/) :
                [];

            CCIO.activationWhitelistEnabled = CCIO.prefs.activationWhitelist.length > 0;

            if (callback) callback();
        });

        return this;
    },


    updateButton: function () {
        // icon
        let buttonStatus = CCIO.enabled ? 'on' : 'off';

        // tooltip text
        let buttonTitle = CCIO.enabled ?
            'CorsE enabled, CORS rules are bypassed' :
            'CorsE disabled, CORS rules are followed';

        // using activation whitelist while enabled
        if (CCIO.enabled && CCIO.activationWhitelistEnabled) {
            buttonStatus = 'on-filter';
            buttonTitle += ' (using activation whitelist)';
        }

        // proceed
        browser.browserAction.setIcon({
            path: {
                48: 'media/image-' + buttonStatus + '.png'
            }
        });

        browser.browserAction.setTitle({ title: buttonTitle });

        return this;
    },


    requestHandler: function(request) {
        // prepare transaction, store transaction request
        let transaction = {
            request: request,
            requestHeaders: {},
            response: {},
            responseHeaders: {}
        };

        // shorthand access to request headers
        for (let header of request.requestHeaders) {
            transaction.requestHeaders[header.name.toLowerCase()] = header;
        }

        // store transaction
        CCIO.transactions[request.requestId] = transaction;

        // force origin based on prefs
        if (bg.prefs.staticOrigin) {
            transaction.requestHeaders['origin'].value = bg.prefs.staticOrigin;
        }

        // apply modifications
        return {
            requestHeaders: transaction.request.requestHeaders
        };
    },


    responseHandler: function(response) {
        // get transaction
        let transaction = CCIO.transactions[response.requestId];

        //processing flag
        let doProcess = false;

        allowedOrigins.forEach((obj) => {
            if (transaction.request.originUrl.indexOf(obj) === 0) {
                console.log(transaction.request.originUrl);
                doProcess = true;
                //break;
            }
        })

        // modify the headers
        if (doProcess) {
            // store transaction response
            transaction.response = response;

            // shorthand access to response headers
            for (let header of response.responseHeaders) {
                transaction.responseHeaders[header.name.toLowerCase()] = header;
            }

            // create response headers if necessary
            for (let name of [
                    'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-allow-credentials'
                ]) {
                // header exists, skip
                if (transaction.responseHeaders[name]) {
                    continue;
                }

                // create header
                let header = {
                    name: name,
                    value: "null"
                };

                // update response
                transaction.response.responseHeaders.push(header)

                // update shorthand
                transaction.responseHeaders[name] = header;
            }

            // set "access-control-allow-origin", prioritize "origin" else "*"
            transaction.responseHeaders['access-control-allow-origin'].value =
                transaction.requestHeaders['origin'] &&
                transaction.requestHeaders['origin'].value !== null ?
                transaction.requestHeaders['origin'].value :
                '*';

            // set "access-control-allow-methods"
            if (
                transaction.requestHeaders['access-control-request-method'] &&
                transaction.requestHeaders['access-control-request-method'].value !== null
            ) {
                transaction.responseHeaders['access-control-allow-methods'].value =
                    transaction.requestHeaders['access-control-request-method'].value
            }

            // set "access-control-allow-headers"
            if (
                transaction.requestHeaders['access-control-request-headers'] &&
                transaction.requestHeaders['access-control-request-headers'].value !== null
            ) {
                transaction.responseHeaders['access-control-allow-headers'].value =
                    transaction.requestHeaders['access-control-request-headers'].value
            }

            // set "access-control-allow-credentials"
            transaction.responseHeaders['access-control-allow-credentials'].value = "true";
        }

        // delete transaction
        delete CCIO.transactions[response.requestId];

        // return headers
        return {
            responseHeaders: transaction.response.responseHeaders
        };
    }
};




var bg = CCIO.init();
