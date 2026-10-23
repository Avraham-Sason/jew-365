let calls = 0;

module.exports = {
  getRandomBytes: (count) => {
    const offset = 13 * calls++;
    return Uint8Array.from({ length: count }, (_, i) => (i * 7 + offset) % 256);
  },
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  digestStringAsync: async (algorithm, data) => {
    if (algorithm !== 'SHA-256') throw new Error(`unsupported ${algorithm}`);
    return require('crypto').createHash('sha256').update(data, 'utf8').digest('hex');
  },
};
