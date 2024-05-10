{
	const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3)
	chrome.runtime.onStartup.addListener(keepAlive)
	keepAlive()
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg.type === 'get-post-id') {
		chrome.tabs.get(msg.tabId)
			.then(tab => {
				const stringPostId = tab.url.match(/(?<=\/posts\/)\d+/)?.[0]
				if (!stringPostId) throw new TypeError(`stringPostId is ${stringPostId}`)
				sendResponse(Number(stringPostId))
			})
		return true
	}
})
