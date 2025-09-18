

import app from './app';
import serverlessExpress from 'aws-serverless-express';


const server = serverlessExpress.createServer(app);

export const handler = (event, context) => {
  return serverlessExpress.proxy(server, event, context);
};

//Backend
