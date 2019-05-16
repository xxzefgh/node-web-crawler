const program = require('./lib/main')
const arg_url = process.argv[2]

if (typeof arg_url === 'string') {
	program(arg_url)
		.then(result => {
			console.log('internal links:', result[0])
			console.log('external links:', result[1])
		})
		.catch(console.error.bind(console))
} else {
	console.error('provide url as argument')
}
