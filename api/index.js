import dispatchApiRequest from '../server/router.js';

export default async function handler(req, res) {
  return dispatchApiRequest(req, res);
}
