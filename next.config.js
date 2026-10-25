// Expose only non-secret deployment metadata, never session tokens or credentials.
// Shared-db Preview is disabled unless the operator explicitly opts in.
module.exports = {
  async rewrites() {
    const modelOrigin = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0';
    return [
      {
        source: '/ocr-models/PP-OCRv6_small_det_onnx_infer.tar',
        destination: `${modelOrigin}/PP-OCRv6_small_det_onnx_infer.tar`
      },
      {
        source: '/ocr-models/PP-OCRv6_small_rec_onnx_infer.tar',
        destination: `${modelOrigin}/PP-OCRv6_small_rec_onnx_infer.tar`
      }
    ];
  },
  webpack(config, { isServer }) {
    // PaddleOCR.js imports the browser OpenCV build, which contains a guarded
    // Node-only `fs` require for its Node runtime. The browser bundle must not
    // resolve that branch.
    if (!isServer) config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
  env: {
    ESTOQUE_DEPLOY_ENV: process.env.VERCEL_ENV || '',
    ESTOQUE_SHARED_DB_PREVIEW: process.env.ESTOQUE_ALLOW_SHARED_DB_PREVIEW === 'true' ? 'true' : 'false',
    ESTOQUE_PREVIEW_BRANCH: process.env.VERCEL_GIT_COMMIT_REF || ''
  }
};
