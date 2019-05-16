const got = require('got')
const URL = require('url').URL
const htmlparser = require('htmlparser2')

const mailto_matcher = /^mailto:/i
const scheme_matcher = /^[a-z][a-z0-9.+-]*:\/{2}/i
const http_matcher = /^https?:\/{2}/i
const processed_urls = []
const MAX_DEPTH = 2

module.exports = function main(url) {
	return process_url(prepend_http_scheme(url))
}

/**
 * @param {string} str
 * @returns {Promise<[string[], string[]]>}
 */
function log_and_return_empty(str) {
	console.log(str)
	return Promise.resolve([[], []])
}

/**
 * @param {string} url
 * @param {number} depth
 * @returns {Promise<[string[], string[]]>}
 */
function process_url(url, depth = 1) {
	console.log(`processing: ${url}`)
	if (depth > MAX_DEPTH) {
		return log_and_return_empty(`reached max recursion depth: ${url}`)
	}

	const parsed_url = parse_url(url)
	if (!parsed_url) {
		return log_and_return_empty(`invalid url: ${url}`)
	}

	if (processed_urls.includes(parsed_url.href)) {
		return log_and_return_empty(`url already processed: ${url}`)
	}

	const normalize = normalize_link(parsed_url)
	const is_external = is_external_link(parsed_url)

	return get_links_from_url(parsed_url)
		.catch(error => {
			console.log(`error: ${error}`, parsed_url.href)
			return [[], []]
		})
		.then(links => {
			processed_urls.push(parsed_url.href)

			let internal_links = []
			let external_links = []

			for (let link of links) {
				if (is_http_link(link)) {
					if (is_external(link)) {
						external_links.push(link)
					} else {
						internal_links.push(normalize(link))
					}
				}
			}

			// process internal links sequentially and aggregate results
			return internal_links.reduce((p, link) => {
				return p.then(acc =>
					process_url(link, depth + 1).then(cur => [
						acc[0].concat(cur[0]),
						acc[1].concat(cur[1])
					])
				)
			}, Promise.resolve([internal_links, external_links]))
		})
}

/**
 * @param {URL} url
 * @returns {Promise<string[]>}
 */
function get_links_from_url(url) {
	const result = []
	return new Promise((resolve, reject) => {
		const parser = new htmlparser.WritableStream({
			onopentag(name, attrs) {
				if (name === 'a' && attrs.href) {
					result.push(attrs.href)
				}
			},
			onend() {
				resolve(result)
			},
			onerror() {
				resolve('failed to parse web page')
			}
		})

		got.stream(url.href)
			.pipe(parser)
			.on('error', () => {
				reject('failed to fetch web page')
			})
	})
}

/**
 * @param {string} url
 * @returns {URL|null}
 */
function parse_url(url) {
	try {
		return new URL(url)
	} catch (e) {
		return null
	}
}

/**
 * @param {string} url
 * @returns {string}
 */
function prepend_http_scheme(url) {
	if (scheme_matcher.test(url)) {
		return url
	} else {
		return `http://${url}`
	}
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function is_http_link(url) {
	if (mailto_matcher.test(url)) {
		return false
	}

	const scheme = scheme_matcher.exec(url)
	if (scheme && !http_matcher.test(scheme[0])) {
		return false
	}

	return true
}

/**
 * @param {URL} base_url
 * @returns {function(string): string}
 */
function normalize_link(base_url) {
	return function(target) {
		const parsed_target = parse_url(target)

		if (parsed_target) {
			return parsed_target.href
		} else if (target.substr(0, 2) === '//') {
			return `http:${target}`
		} else if (target.substr(0, 1) === '/') {
			return `${base_url.origin}${target}`
		} else {
			return `${base_url.href}${target}`
		}
	}
}

/**
 * @param {URL} base_url
 * @returns {function(string): boolean}
 */
function is_external_link(base_url) {
	return function(target) {
		const parsed_target = parse_url(target)

		if (parsed_target && parsed_target.host !== base_url.host) {
			return true
		} else {
			return false
		}
	}
}
