const encoder = new window.TextEncoder('utf-8');
const decoder = new window.TextDecoder('utf-8');
const salt = 'Ho5rsGrosxYZnSZVWTS7IobkdOLmmEIMyosiZJwa+Kl2HNc7';

function base64Encode(byteArray) {
    return window.btoa(String.fromCharCode.apply(null, byteArray));
}

function base64Decode(base64) {
    var raw = window.atob(base64);
    var byteCount = raw.length;
    var byteArray = new Uint8Array(new ArrayBuffer(byteCount));
    for (var i = 0; i < byteCount; i++) {
        byteArray[i] = raw.charCodeAt(i);
    }
    return byteArray;
}

function reveal(show, node) {
    if (!show) {
        node.textContent = '';
    } else {
        node.textContent = 
            Array.prototype.slice.call(arguments, 2)
            .map((n) => n.value).join(' ');
    }
}

function hmacSign(secret, text, callback) {
    window.crypto.subtle.importKey(
        "raw", encoder.encode(secret),
        { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign'])
        .then(function(key) {
            window.crypto.subtle.sign(
                { name: 'HMAC' }, key, encoder.encode(text))
                .then(function(signature) {
                    callback(base64Encode(new Uint8Array(signature)));
                });
        });
}

function encrypt(secret, text, callback) {
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    var addData = window.crypto.getRandomValues(new Uint8Array(16));
    window.crypto.subtle.digest(
        { name: 'SHA-256' },
        encoder.encode(
            salt + secret + base64Encode(iv) + base64Encode(addData)))
        .then(function(secretHash) {
            window.crypto.subtle.importKey(
                "raw", secretHash, { name: 'AES-GCM' }, false, ['encrypt'])
                .then(function(secretKey) {
                    window.crypto.subtle.encrypt(
                        { name: 'AES-GCM',
                          iv: iv,
                          additionalData: addData,
                          tagLength: 128 },
                        secretKey, encoder.encode(text))
                        .then(function(encrypted) {
                            var wrapped = new Uint8Array(
                                encrypted.byteLength + 28);
                            wrapped.set(new Uint8Array(encrypted), 28);
                            wrapped.set(iv, 0);
                            wrapped.set(addData, 12);
                            callback(base64Encode(wrapped));
                        });
                });
        });
}

function decrypt(secret, wrapped, callback) {
    var byteArray = base64Decode(wrapped);
    var iv = byteArray.slice(0, 12);
    var addData = byteArray.slice(12, 28);
    var encrypted = byteArray.slice(28);
    window.crypto.subtle.digest(
        { name: 'SHA-256' },
        encoder.encode(
            salt + secret + base64Encode(iv) + base64Encode(addData)))
        .then(function(secretHash) {
            window.crypto.subtle.importKey(
                "raw", secretHash, { name: 'AES-GCM' }, false, ['decrypt'])
                .then(function(secretKey) {
                    window.crypto.subtle.decrypt(
                        { name: 'AES-GCM',
                          iv: iv,
                          additionalData: addData,
                          tagLength: 128 },
                        secretKey, encrypted)
                        .then (function(decrypted) {
                            callback(decoder.decode(decrypted));
                        });
                });
        });
}

function computeId(callback) {
    window.crypto.subtle.digest(
        { name: 'SHA-256' },
        encoder.encode(salt + privKey1.value + svcKey1.value))
        .then(function(hash) {
            var id = base64Encode(new Uint8Array(hash))
                .replace(/[^A-Za-z0-9]+/g, '').slice(0,16)
            callback(id);
        });
}
             

function load() {
    if (!svcKey1.value || !svcKey2.value ||
        !privKey1.value || !privKey2.value) return;
    computeId(function(id) {
        var getReq = new XMLHttpRequest();
        getReq.onload = function(event) {
            var msg = getReq.response;
            if (msg.length > 28) {
                decrypt(
                    svcKey1.value + privKey1.value + privKey2.value, msg,
                    function(decrypted) {
                        message.value = decrypted;
                    });
            }
        }
        var ts = Date.now();
        var url = '/api/d/' + id + '?t=' + ts;
        getReq.open('GET', url, true);
        getReq.responseType = 'arraybuffer';
        hmacSign(
            svcKey1.value + svcKey2.value, 'GET:' + id + ':' + ts,
            function(signature) {
                getReq.setRequestHeader('X-Signature', signature);
                getReq.send();
            });
    });
}

function save() {
    if (!svcKey1.value || !svcKey2.value ||
        !privKey1.value || !privKey2.value || !message.value) return;
    computeId(function(id) {
        var putReq = new XMLHttpRequest();
        var ts = Date.now();
        var url = '/api/d/' + id + '?t=' + ts;
        putReq.open('PUT', url, true);
        putReq.setRequestHeader('Content-Type', 'text/plain');
        hmacSign(
            svcKey1.value + svcKey2.value, 'PUT:' + id + ':' + ts,
            function(signature) {
                putReq.setRequestHeader('X-Signature', signature);
                encrypt(
                    svcKey1.value + privKey1.value + privKey2.value,
                    message.value,
                    function(encrypted) {
                        putReq.send(encrypted)
                    });
            });
    });
}