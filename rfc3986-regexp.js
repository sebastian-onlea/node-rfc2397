/*
 * some Regular Expressions for URL encoding.
 *
 * see https://tools.ietf.org/html/rfc3986#appendix-A
 */
"use strict";

export const unreserved = /[A-Za-z0-9\-\._~]/;

export const escaped = /%[A-Fa-f0-9]{2}/;
