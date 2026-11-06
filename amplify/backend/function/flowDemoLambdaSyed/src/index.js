const awsServerlessExpress = require('aws-serverless-express');
const secrets = require('./secrets-loader');

// The app is required only AFTER the secrets are in process.env (config.js reads them when it loads). A failed load is retried on
// the next request instead of being remembered for the life of the container.
let ready = null;
let server = null;
const ensureReady = () => ready || (ready = secrets.load().then((r) => { if (r.error) ready = null; return r; }));

/**
 * @type {import('@types/aws-lambda').APIGatewayProxyHandler}
 */
exports.handler = async (event, context) => {
  // One short line per request. Never dump the whole event: it carries headers (Authorization, webhook secrets, account tokens)
  // and bodies (API keys typed into the Forward tab, card and wallet data).
  console.log(`REQUEST ${event.httpMethod} ${event.path} ${event.requestContext && event.requestContext.requestId || ''}`);
  await ensureReady();
  if (!server) server = awsServerlessExpress.createServer(require('./app'));
  return awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
};
