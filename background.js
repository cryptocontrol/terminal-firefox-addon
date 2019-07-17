const allowedOrigins = [
	'https://terminal-test.cryptocontrol.io',
	'https://terminal.cryptocontrol.io',
	'http://localhost:3000'
]


const corsEverywhere = {
    enabled: false,
    activationWhitelistEnabled: false,
    transactions: {},

    init: function() {
        corsEverywhere.toggle(true);
        corsEverywhere.updateButton();
        return this;
    },


    toggle: function(state) {
        // set state by input
        if (typeof state === 'boolean') corsEverywhere.enabled = state;

        // set state by toggle
        else corsEverywhere.enabled = !corsEverywhere.enabled;

        // update button
        corsEverywhere.updateButton();

        // clear transactions
        corsEverywhere.transactions = {};

        // add observer, observe http responses
        if (corsEverywhere.enabled) {
            browser.webRequest.onBeforeSendHeaders.addListener(
                corsEverywhere.requestHandler, {urls: ["<all_urls>"]}, ["blocking", "requestHeaders"]
            );

            browser.webRequest.onHeadersReceived.addListener(
                corsEverywhere.responseHandler, {urls: ["<all_urls>"]}, ["blocking", "responseHeaders"]
            );
        }

        // remove observer
        else {
            browser.webRequest.onBeforeSendHeaders.removeListener(corsEverywhere.requestHandler);
            browser.webRequest.onHeadersReceived.removeListener(corsEverywhere.responseHandler);
        }

        return this;
    },


    updateButton: function() {
        // icon
        let buttonStatus = corsEverywhere.enabled ? 'on': 'off';

        // tooltip text
        let buttonTitle = corsEverywhere.enabled
            ? 'Plugin enabled, CORS rules are bypassed'
        : 'Plugin disabled, CORS rules are followed';

        // using activation whitelist while enabled
        if (corsEverywhere.enabled && corsEverywhere.activationWhitelistEnabled) {
            buttonStatus =  'on-filter';
            buttonTitle  += ' (using activation whitelist)';
        }

        // proceed
        browser.browserAction.setIcon({path:{48:'media/image-'+buttonStatus+'.png'}});
        browser.browserAction.setTitle({title:buttonTitle});

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
        corsEverywhere.transactions[request.requestId] = transaction;

        // force origin based on prefs
        // if (bg.prefs.staticOrigin) transaction.requestHeaders['origin'].value = bg.prefs.staticOrigin;

        // apply modifications
        return { requestHeaders: transaction.request.requestHeaders };
    },


    responseHandler: function(response) {
        // get transaction
        let tx = corsEverywhere.transactions[response.requestId];

        // processing flag
        let doProcess = false;

        allowedOrigins.forEach((obj) => {
          if (tx.request.originUrl.indexOf(obj) === 0) doProcess = true;
        })

        // modify the headers
        if (doProcess) {
            // store transaction response
            tx.response = response;

            // shorthand access to response headers
            for (let header of response.responseHeaders) {
                tx.responseHeaders[header.name.toLowerCase()] = header;
            }

            // create response headers if necessary
            for (let name of ['access-control-allow-origin', 'access-control-allow-methods',
                'access-control-allow-headers', 'access-control-allow-credentials']) {
                // header exists, skip
                if (tx.responseHeaders[name]) continue;

                // create header
                let header = { name: name, value: "null" };

                // update response
                tx.response.responseHeaders.push(header)

                // update shorthand
                tx.responseHeaders[name] = header;
            }

            // set "access-control-allow-origin", prioritize "origin" else "*"
            tx.responseHeaders['access-control-allow-origin'].value =
                tx.requestHeaders['origin']
                && tx.requestHeaders['origin'].value !== null
                    ? tx.requestHeaders['origin'].value
                : '*';

            // set "access-control-allow-methods"
            if (
                tx.requestHeaders['access-control-request-method']
                && tx.requestHeaders['access-control-request-method'].value !== null
            ) {
                tx.responseHeaders['access-control-allow-methods'].value =
                    tx.requestHeaders['access-control-request-method'].value
            }

            // set "access-control-allow-headers"
            if (
                tx.requestHeaders['access-control-request-headers']
                && tx.requestHeaders['access-control-request-headers'].value !== null
            ) {
                tx.responseHeaders['access-control-allow-headers'].value =
                    tx.requestHeaders['access-control-request-headers'].value
            }

            // set "access-control-allow-credentials"
            tx.responseHeaders['access-control-allow-credentials'].value = "true";
        }

        // delete transaction
        delete corsEverywhere.transactions[response.requestId];

        // return headers
        return {
            responseHeaders: tx.response.responseHeaders
        };
    }
};


const bg = corsEverywhere.init();
