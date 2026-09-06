/**
 * Vercel Serverless Function Entrypoint
 * Routes all /api/* HTTP requests to the LifeOS AI production handler.
 */

const { requestHandler } = require('../server.js');

module.exports = async (req, res) => {
    return requestHandler(req, res);
};
