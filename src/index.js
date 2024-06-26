"use strict";

import { unreserved, escaped } from "./rfc3986-regexp.js";

/** 
 * @typedef {{ base64: boolean; mime: string | undefined; parameters: Record<string,string>; data: any; }} Info 
 */

/**
 * validate and decode "%xx hex" encoded strings into a Buffer.
 * @param {string} urlencoded
 * @returns {Buffer}
 */
function pct_decode(urlencoded) {
    var correctly_encoded = new RegExp(
        "^(?:" + unreserved.source + "|" + escaped.source + ")*$"
    );
    var splitter = new RegExp("(" + escaped.source + ")");

    if (!urlencoded.match(correctly_encoded))
        throw new Error("malformed data");

    var buffers = urlencoded.split(splitter).map(function (part) {
        if (part.match(escaped)) {
            return Buffer.from(/* remove leading `%' */part.slice(1), "hex");
        } else {
            return Buffer.from(part, "ascii");
        }
    });

    return Buffer.concat(buffers);
}


/**
 * Encode argument into a percent encoded string.
 * @param {string | Buffer} arg 
 * @returns {string}
 */
function pct_encode(arg) {
    // convert arg to an array of bytes and escape every one of them that is
    // "unsafe" (i.e. unreserved).
    var bytes   = Uint8Array.from(Buffer.from(arg));
    var encoded = bytes.reduce(function (str, byte) {
        var char = String.fromCharCode(byte);
        if (char.match(unreserved))
            return str + char;
        else {
            // this byte need to be "%xx hex" encoded
            var hex = byte.toString(16);
            if (hex.length == 1) // e.g. 0x1 would be 1 but we need 01
                hex = "0" + hex;
            return str + "%" + hex;
        }
    }, "");
    return encoded;
}


/**
 * validate and decode a base64 encoded string into a buffer.
 * @param {string} base64encoded 
 * @returns {Buffer}
 */
function base64_decode(base64encoded) {
    // we validate "by hand" the base64encoded data, because Buffer.from will
    // "successfully" parse non-base64 data.
    //
    // regexp taken from
    // https://stackoverflow.com/a/76279466
    var correctly_encoded = /^[A-Za-z0-9+\/]*=?=?$/;

    if (base64encoded.length % 4 !== 0 || !base64encoded.match(correctly_encoded))
        throw new Error("malformed data");

    return Buffer.from(base64encoded, 'base64');
}


/*
 * Encode argument into a base64 encoded string.
 */
/**
 * @param {string | Buffer} arg 
 * @returns {string}
 */
function base64_encode(arg) {
    var buff = Buffer.from(arg);
    return buff.toString("base64");
}


/**
 * @param {string} dataurl 
 * @returns {Info}
 */
export function parseSync(dataurl) {
    // capture groups:
    //   (1) [ mediatype ] [ ";base64" ]
    //   (2) data
    var groups = dataurl.match(/^data:(.*?),(.*)$/);
    if (!groups)
        throw new Error("malformed dataurl");

    // index 0 is the full match
    var mediatype = groups[1].split(";"); // capture group (1)
    var data = groups[2]; // capture group (2)

    var info = {};
    // base64 is a special case and the last element (if present).
    if (mediatype[mediatype.length - 1] === "base64") {
        info.base64 = true;
        mediatype.pop(); // remove "base64" from the mediatype
    }
    // mime (i.e. type/subtype) is the first element.
    info.mime = mediatype.shift();
    // parameters follow
    info.parameters = mediatype.reduce(function (parameters, parameter) {
        var splitted = parameter.split("=");
        if (splitted.length !== 2)
            throw new Error("invalid dataurl parameter");
        /*
         * pct_encode() both attribute and value, see § 3:
         *
         * "attribute" and "value" are the corresponding tokens from
         * [RFC2045], represented using URL escaped encoding of
         * [RFC2396] as necessary.
        */
        var attribute = pct_decode(splitted[0]).toString();
        var value = pct_decode(splitted[1]).toString();
        if (!(attribute in parameters))
            parameters[attribute] = value;
        return parameters;
    }, {});

    var mime_omitted = (info.mime.length === 0);
    if (mime_omitted && Object.keys(info.parameters).length === 0) {
        // If <mediatype> is omitted, it defaults to
        // text/plain;charset=US-ASCII.
        info.mime = 'text/plain';
        info.parameters.charset = "US-ASCII";
    } else if (mime_omitted && "charset" in info.parameters) {
        // As a shorthand, "text/plain" can be omitted but the charset
        // parameter supplied.
        info.mime = 'text/plain';
    }

    info.data = (info.base64 ? base64_decode : pct_decode)(data);

    return info;
}

/**
 * @param {string} dataurl 
 * @returns {Promise<Info>}
 */
export function parse(dataurl) {
    return new Promise((resolve, reject) => {
        try {
            resolve(parseSync(dataurl));
        } catch (err) {
            reject(err);
        };
    });
}

/**
 * @param {Info} info 
 * @returns {string}
 */
export function composeSync(info) {
    if (!Buffer.isBuffer(info.data))
        throw new TypeError("expected info.data to be a Buffer");

    var mediatype = [];
    mediatype.push(info.mime || "");
    var parameters = info.parameters || {};
    Object.keys(parameters).forEach(function (key) {
        /*
         * pct_encode() both attribute and value, see § 3:
         *
         * "attribute" and "value" are the corresponding tokens from
         * [RFC2045], represented using URL escaped encoding of
         * [RFC2396] as necessary.
         */
        var attribute = pct_encode(key);
        var value = pct_encode(parameters[key]);
        mediatype.push(attribute + "=" + value);
    });

    var base64 = "";
    var encode = pct_encode;
    if (info.base64) {
        base64 = ";base64";
        encode = base64_encode;
    }
    var data = encode(info.data);

    return "data:" + mediatype.join(";") + base64 + "," + data;
}

/**
 * @param {Info} info 
 * @returns {Promise<string>}
 */
export function compose(info) {
    return new Promise((resolve, reject) => {
        try {
            resolve(composeSync(info));
        } catch (err) {
            reject(err);
        }
    });
}