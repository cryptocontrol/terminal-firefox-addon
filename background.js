const allowedOrigins = [
	'https://terminal-test.cryptocontrol.io',
	'https://terminal.cryptocontrol.io',
	'http://localhost:3000'
]


//************************************************************* class definition
var corsEverywhere = {


    /***************************************************************************
    props
    ***/ 
    enabled                     : false
    ,activationWhitelistEnabled : false
    ,prefs                      : {} // holds user prefs
    ,transactions               : {} // contains requests/responses


    /***************************************************************************
    init
    ***/
    ,init : function() {

        // toggle activation on button click
        browser.browserAction.onClicked.addListener(function(){
            corsEverywhere.toggle();
						browser.tabs.query({
					    currentWindow: true,
					    active: true
					  }).then(sendMessageToTabs)//.catch(error => console.error(error));
        });

        // load prefs
        corsEverywhere.loadPrefs(function(){
            // enact enabled at startup
            if(corsEverywhere.prefs.enabledAtStartup) {
                corsEverywhere.toggle(true);
            }

            // update button
            corsEverywhere.updateButton();
        });

        return this;
    }


    /***************************************************************************
    toggle
    ***/
    ,toggle : function(state) {

        // set state by input
        if(typeof state === 'boolean') {
            corsEverywhere.enabled = state;
        }
        // set state by toggle
        else {
            corsEverywhere.enabled = !corsEverywhere.enabled;
        }

        // update button
        corsEverywhere.updateButton();

        // clear transactions
        corsEverywhere.transactions = {};

        // add observer, observe http responses
        if(corsEverywhere.enabled) {

            browser.webRequest.onBeforeSendHeaders.addListener(
                corsEverywhere.requestHandler
                ,{urls: ["<all_urls>"]}
                ,["blocking" ,"requestHeaders"]
            );

            browser.webRequest.onHeadersReceived.addListener(
                corsEverywhere.responseHandler
                ,{urls: ["<all_urls>"]}
                ,["blocking" ,"responseHeaders"]
            );
        }

        // remove observer
        else {

            browser.webRequest.onBeforeSendHeaders.removeListener(
                corsEverywhere.requestHandler
            );

            browser.webRequest.onHeadersReceived.removeListener(
                corsEverywhere.responseHandler
            );
        }

        return this;
    }


    /***************************************************************************
    re/load preferences
    Because fetching prefs returns a promise, we use a callback to do stuff when
    the promise is fullfilled.
    ***/
    ,loadPrefs : function(callback) {

        browser.storage.sync.get([
            'enabledAtStartup',
            'staticOrigin',
            'activationWhitelist',
        ]).then((res) => {

            // get prefs, set default value if n/a
            corsEverywhere.prefs.enabledAtStartup    = res.enabledAtStartup    || false;
            corsEverywhere.prefs.staticOrigin        = res.staticOrigin        || '';
            corsEverywhere.prefs.activationWhitelist = res.activationWhitelist || '';

            // parse activation whitelist
            corsEverywhere.prefs.activationWhitelist = corsEverywhere.prefs.activationWhitelist
                ? corsEverywhere.prefs.activationWhitelist.split(/[\r\n]+/)
                : [];

            corsEverywhere.activationWhitelistEnabled = corsEverywhere.prefs.activationWhitelist.length > 0
                ? true
                : false;

            if(callback) {
                callback();
            }
        });

        return this;
    }


    /***************************************************************************
    	updateButton
    ***/
    ,updateButton : function() {
        // icon
        let buttonStatus = corsEverywhere.enabled ? 'on' : 'off';

        // tooltip text
        let buttonTitle = corsEverywhere.enabled
            ? 'CorsE enabled, CORS rules are bypassed'
            : 'CorsE disabled, CORS rules are followed';

        // using activation whitelist while enabled
        if (corsEverywhere.enabled && corsEverywhere.activationWhitelistEnabled) {
            buttonStatus =  'on-filter';
            buttonTitle  += ' (using activation whitelist)';
        }

        // proceed
        browser.browserAction.setIcon({path:{48:'media/image-'+buttonStatus+'.png'}});
        browser.browserAction.setTitle({title:buttonTitle});

        return this;
    }


    /***************************************************************************
    requestHandler
    ***/
    ,requestHandler : function(request) {

        // prepare transaction, store transaction request
        let transaction = {
             request         : request
            ,requestHeaders  : {}
            ,response        : {}
            ,responseHeaders : {}
        };

        // shorthand access to request headers
        for(let header of request.requestHeaders) {
            transaction.requestHeaders[header.name.toLowerCase()] = header;
        }

        // store transaction
        corsEverywhere.transactions[request.requestId] = transaction;

        // force origin based on prefs
        if(bg.prefs.staticOrigin) {
            transaction.requestHeaders['origin'].value = bg.prefs.staticOrigin;
        }

        // apply modifications
        return {
            requestHeaders : transaction.request.requestHeaders
        };
    }


    /***************************************************************************
    responseHandler
    ***/
    ,responseHandler : function(response) {


        // get transaction
        let transaction = corsEverywhere.transactions[response.requestId];

        //processing flag
        //let doProcess = false;

        allowedOrigins.forEach((obj) => {
          if(transaction.request.originUrl.indexOf(obj) === 0) {
            //console.log(transaction.request.originUrl);
            doProcess = true;
            //break;
          }
        })

        // modify the headers
        if(doProcess) {

            // store transaction response
            transaction.response = response;

            // shorthand access to response headers
            for(let header of response.responseHeaders) {
                transaction.responseHeaders[header.name.toLowerCase()] = header;
            }

            // create response headers if necessary
            for(let name of [
                 'access-control-allow-origin'
                ,'access-control-allow-methods'
                ,'access-control-allow-headers'
                ,'access-control-allow-credentials'
            ]) {
                // header exists, skip
                if(transaction.responseHeaders[name]) {
                    continue;
                }

                // create header
                let header = {
                     name  : name
                    ,value : "null"
                };

                // update response
                transaction.response.responseHeaders.push(header)

                // update shorthand
                transaction.responseHeaders[name] = header;
            }

            // set "access-control-allow-origin", prioritize "origin" else "*"
            transaction.responseHeaders['access-control-allow-origin'].value =
                transaction.requestHeaders['origin']
                && transaction.requestHeaders['origin'].value !== null
                    ? transaction.requestHeaders['origin'].value
                    : '*';

            // set "access-control-allow-methods"
            if(
                transaction.requestHeaders['access-control-request-method']
                && transaction.requestHeaders['access-control-request-method'].value !== null
            ) {
                transaction.responseHeaders['access-control-allow-methods'].value =
                    transaction.requestHeaders['access-control-request-method'].value
            }

            // set "access-control-allow-headers"
            if(
                transaction.requestHeaders['access-control-request-headers']
                && transaction.requestHeaders['access-control-request-headers'].value !== null
            ) {
                transaction.responseHeaders['access-control-allow-headers'].value =
                    transaction.requestHeaders['access-control-request-headers'].value
            }

            // set "access-control-allow-credentials"
            transaction.responseHeaders['access-control-allow-credentials'].value = "true";
        }

        // delete transaction
        delete corsEverywhere.transactions[response.requestId];

        // return headers
        return {
            responseHeaders: transaction.response.responseHeaders
        };
    }
};




//************************************************************************** run
var bg = corsEverywhere.init();
