#!/usr/bin/env python3
"""
CORS Proxy Server for Kaohsiung iBus+ API
Forwards requests to https://citygpt.foxconn.com/data with proper headers
"""

import os
import logging
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app, origins="*")  # Allow all origins for local development

# Configuration
UPSTREAM_BASE = "https://citygpt.foxconn.com/data"
SUBSCRIPTION_KEY = "676ec13f73aa4cdfbdffd6598189593b"
UPSTREAM_HEADERS = {
    "Ocp-Apim-Subscription-Key": SUBSCRIPTION_KEY,
    "Accept": "application/json",
    "X-Api-Version": "1",
    "Accept-Language": "zh-TW",
}

# API Endpoints mapping (only those used by official iBus+ frontend)
ENDPOINTS = {
    "routes": "/abfs/dal/v_stg_tdx_route",
    "stations": "/abfs/dal/v_stg_tdx_station",
    "stops": "/abfs/dal/v_stg_tdx_stop",
    "estimated_arrivals": "/abfs/dal/v_stg_tdx_estimatedtimeofarrival_pt1m",
    "realtime": "/abfs/dal/v_stg_tdx_realtimebyfrequency_pt1m",
    "shapes": "/abfs/dal/v_stg_tdx_shape",
    "alerts": "/abfs/dal/v_stg_tdx_alert",
    "operators": "/abfs/dal/v_stg_tdx_operator",
    "schedules": "/abfs/dal/v_stg_tdx_schedule",
    "fare": "/abfs/dal/v_stg_tdx_routefare",
    "news": "/abfs/dal/v_stg_tdx_news",
    "groups": "/abfs/dal/v_stg_ibus_routegrp",
    "gateway": "/abfs/dal/v_stg_ibus_gateway",
}

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def build_upstream_url(endpoint: str, query_string: str = "") -> str:
    """Build the full upstream URL with query parameters."""
    path = ENDPOINTS.get(endpoint, endpoint)
    url = f"{UPSTREAM_BASE}{path}"
    if query_string:
        url += f"?{query_string}"
    return url


@app.route("/health")
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "kaohsiung-bus-cors-proxy"})


@app.route("/api/<endpoint>", methods=["GET", "POST", "OPTIONS"])
def proxy_api(endpoint: str):
    """Proxy endpoint for iBus+ API."""
    if request.method == "OPTIONS":
        return _build_cors_preflight_response()

    if endpoint not in ENDPOINTS:
        return jsonify({"error": f"Unknown endpoint: {endpoint}"}), 404

    # Get query parameters
    query_string = request.query_string.decode("utf-8")

    # Build upstream URL
    upstream_url = build_upstream_url(endpoint, query_string)
    logger.info(f"Proxying {request.method} {upstream_url}")

    try:
        # Prepare headers
        headers = dict(UPSTREAM_HEADERS)
        # Forward any additional headers from client (excluding host)
        for key, value in request.headers:
            if key.lower() not in ("host", "content-length", "content-type"):
                headers[key] = value

        # Make request to upstream
        if request.method == "GET":
            resp = requests.get(upstream_url, headers=headers, timeout=30)
        else:
            resp = requests.post(
                upstream_url,
                headers=headers,
                data=request.get_data(),
                timeout=30
            )

        # Return response
        return Response(
            resp.content,
            status=resp.status_code,
            headers={
                "Content-Type": resp.headers.get("Content-Type", "application/json"),
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            }
        )

    except requests.exceptions.Timeout:
        logger.error(f"Timeout calling {upstream_url}")
        return jsonify({"error": "Upstream timeout"}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling {upstream_url}: {e}")
        return jsonify({"error": f"Upstream error: {str(e)}"}), 502


def _build_cors_preflight_response():
    """Build CORS preflight response."""
    response = Response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    return response


@app.route("/api/graphql", methods=["POST", "OPTIONS"])
def proxy_graphql():
    """Proxy for legacy GraphQL endpoint (ibus.tbkc.gov.tw)."""
    if request.method == "OPTIONS":
        return _build_cors_preflight_response()

    # Check if old GraphQL endpoint is still alive
    legacy_url = "https://ibus.tbkc.gov.tw/ibus/graphql"
    try:
        resp = requests.post(
            legacy_url,
            json=request.get_json(),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=30
        )
        return Response(
            resp.content,
            status=resp.status_code,
            headers={
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            }
        )
    except requests.exceptions.RequestException as e:
        logger.warning(f"Legacy GraphQL endpoint failed: {e}")
        return jsonify({"error": "Legacy GraphQL endpoint unavailable"}), 503


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8082))
    logger.info(f"Starting CORS proxy server on port {port}")
    logger.info(f"Upstream base: {UPSTREAM_BASE}")
    logger.info(f"Available endpoints: {list(ENDPOINTS.keys())}")
    app.run(host="0.0.0.0", port=port, debug=True)