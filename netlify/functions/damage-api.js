const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: jsonHeaders, body: '' };
  }

  const targetUrl = process.env.APPS_SCRIPT_URL;
  if (!targetUrl) {
    return jsonResponse(500, {
      ok: false,
      error: 'Missing APPS_SCRIPT_URL environment variable'
    });
  }

  try {
    const request = parseRequest(event);
    const action = String(request.action || 'getAppData').trim();
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    const apiToken = process.env.DAMAGE_API_TOKEN || process.env.API_TOKEN || request.apiToken || '';
    const body = { action, payload };
    if (apiToken) body.apiToken = apiToken;

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    return {
      statusCode: upstream.ok ? 200 : upstream.status,
      headers: jsonHeaders,
      body: text
    };
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
};

function parseRequest(event) {
  if (event.httpMethod === 'GET') {
    const query = event.queryStringParameters || {};
    const payload = { ...query };
    delete payload.action;
    return { action: query.action, payload };
  }

  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(text || '{}');
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}
