# cors proxy
Serverless cors proxy on a cloudflare [worker](https://workers.cloudflare.com/)

```js
export default {
	async fetch(request) {

		// Whitelist domains that can be proxied
		const ALLOWED_DOMAINS = ['esami.unipi.it'];

		if (request.method !== 'GET') {
			return new Response(null, {
				status: 405,
				statusText: 'Method Not Allowed',
			});
		}
		// Get the API URL
		const reqUrl = new URL(request.url);
		const apiUrl = new URL(`https:/${reqUrl.pathname}${reqUrl.search}`);

		if (!ALLOWED_DOMAINS.some((domain) => apiUrl.hostname.endsWith(domain))) {
			return new Response(null, {
				status: 403,
				statusText: 'Forbidden',
			});
		}

		try {
			request = new Request(apiUrl, request);
			let response = await fetch(request);

			// Recreate the response so you can modify the headers
			response = new Response(response.body, response);
			// Set CORS headers
			response.headers.set('Access-Control-Allow-Origin', reqUrl.origin);
			// Add Vary header so browser will cache response correctly
			response.headers.append('Vary', 'Origin');

			return response;
		} catch (error) {
			return new Response(null, {
				status: 500,
				statusText: 'Internal Server Error',
			});
		}
	},
};
```