/**
 * @typedef {string & {}} PostId
 * @type {Map<PostId, Video>}
 */
const videoMap = new Map()

const VIDEO_LAST_PART_NUM_REGEX = /\/video(\d+)\.ts(?![^]*\/video\d+\.ts)/
class Video {
	loadedKeyCount = 0
	keys = []
	constructor(id, mainBody) {
		this.id = id
		this.mainBody = mainBody
		this.keyCount = mainBody.match(/#EXT-X-KEY:/g).length
	}
	get readyToDownload() {
		return this.loadedKeyCount == this.keyCount
	}
}

const itemsEl = document.getElementById('items')

chrome.devtools.network.onRequestFinished.addListener(async req => {
	const reqUrl = req.request.url
	
	if (reqUrl.includes('iframe.mediadelivery.net/') && reqUrl.includes('/video.drm')) {
		console.log('main', req)
	
		const postId = await getPostId()
		if (getPostEl(postId)) return
		
		const body = decodeDrmRespBodyConditionally(await getRespBody(req))
		const videoId = new URL(reqUrl).pathname.replace(/^\//, '').split('/')[0]
		const video = new Video(videoId, body)
		videoMap.set(postId, video)
		itemsEl.append(createPostEl(postId, video))
	} else if (/\.drmkey/.test(reqUrl)) {
		console.log('.drmkey', req)
		
		if (req.response.status !== 200) return
		
		const postId = await getPostId()
		const body = decodeDrmRespBodyConditionally(await getRespBody(req))
		
		const video = videoMap.get(postId)
		if (!video) throw new Error('video not found')
		
		const keyIdx = reqUrl.match(/\?v=(\d+)/)[1]
		video.keys[keyIdx] = Array.from(body, c => c.charCodeAt(0))
		video.loadedKeyCount++
		
		const postEl = getPostEl(postId)
		postEl.querySelector('progress').value++
		if (video.readyToDownload) postEl.querySelector('.download-btn').disabled = false
	}
})

const decodeDrmRespBodyConditionally = ({ body, encoding }) =>
	encoding === 'base64' ? atob(body) : body

const getRespBody = req =>
	new Promise(res =>
		req.getContent((body, encoding) =>
			res({ body, encoding })
		)
	)

const getPostId = (tabId = chrome.devtools.inspectedWindow.tabId) =>
	chrome.runtime.sendMessage({ type: 'get-post-id', tabId })

/**
 * @param {PostId} postId
 * @param {Video} video
 */
const createPostEl = (postId, video) => {
	const postEl = document.createElement('article')
	postEl.classList.add('post')
	postEl.dataset.postId = postId
	
	postEl.append(postId)
	{
		const progressEl = document.createElement('progress')
		progressEl.value = 0
		progressEl.max = video.keyCount
		postEl.append(progressEl)
	}
	{
		const downloadBtnEl = document.createElement('button')
		downloadBtnEl.classList.add('download-btn')
		downloadBtnEl.innerText = 'Download'
		downloadBtnEl.disabled = true
		downloadBtnEl.addEventListener('click', () => {
			fetch('http://localhost:9987/download', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					postId,
					mainBody: video.mainBody,
					keys: video.keys,
				}),
			})
				.then(() => {
					alert('ok')
				})
				.catch(err => {
					console.error(err)
					alert(`error: ${err}`)
				})
		})
		postEl.append(downloadBtnEl)
	}
	
	return postEl
}
const getPostEl = postId =>
	document.querySelector(`[data-post-id="${postId}"]`)
