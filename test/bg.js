function letsDoThis(data){
  console.log('yahoo');
    browser.notifications.create({
        "type": "basic",
        "title": "PING",
        "message": "yahoo"
    })
}

browser.runtime.onMessage.addListener(letsDoThis);

browser.tabs.onUpdated.addListener(processPageAction)

function processPageAction(tabId){
    browser.pageAction.show(tabId)
}

browser.pageAction.onClicked.addListener(sendData)

function sendData(tab){
    browser.tabs.sendMessage(tab.id, {data:'dummyData'})
}
