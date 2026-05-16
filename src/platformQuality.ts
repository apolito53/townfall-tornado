const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software|basic render|mesa offscreen|warp/i;
const INTEGRATED_RENDERER_PATTERN = /intel|uhd|iris|vega|radeon graphics|adreno|mali|powervr/i;
const DISCRETE_RENDERER_PATTERN = /nvidia|geforce|rtx|gtx|radeon rx|rx\s?\d|intel\(r\) arc|apple m\d|apple gpu/i;
const MOBILE_PATTERN = /android|iphone|ipad|ipod|mobile/i;

function readWebGlDetails() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');

  if (!gl) {
    return {
      webglAvailable: false,
      vendor: 'unknown',
      renderer: 'unavailable',
      maxTextureSize: 0,
      maxRenderbufferSize: 0,
    };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR);
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  return {
    webglAvailable: true,
    vendor: String(vendor ?? 'unknown'),
    renderer: String(renderer ?? 'unknown'),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0),
    maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 0),
  };
}

export function detectPlatformQuality() {
  const webgl = readWebGlDetails();
  const rendererText = `${webgl.vendor} ${webgl.renderer}`;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 0;
  const deviceMemory = Number((navigator as any).deviceMemory ?? 0);
  const devicePixelRatio = window.devicePixelRatio || 1;
  const userAgent = navigator.userAgent;
  const isMobile = MOBILE_PATTERN.test(userAgent) || navigator.maxTouchPoints > 1;
  const softwareRenderer = SOFTWARE_RENDERER_PATTERN.test(rendererText) || !webgl.webglAvailable;
  const integratedRenderer = INTEGRATED_RENDERER_PATTERN.test(rendererText);
  const discreteRenderer = DISCRETE_RENDERER_PATTERN.test(rendererText);
  const reasons = [];
  let recommendedQuality = 'medium';
  let tier = 'unknown';

  if (softwareRenderer) {
    recommendedQuality = 'low';
    tier = 'software';
    reasons.push('Software or unavailable WebGL renderer');
  } else if (
    isMobile
    || (deviceMemory > 0 && deviceMemory <= 4)
    || (hardwareConcurrency > 0 && hardwareConcurrency <= 4)
    || webgl.maxTextureSize > 0 && webgl.maxTextureSize < 8192
  ) {
    recommendedQuality = 'low';
    tier = integratedRenderer ? 'integrated' : 'low-power';
    reasons.push('Mobile or constrained browser hardware signals');
  } else if (
    discreteRenderer
    && (deviceMemory === 0 || deviceMemory >= 8)
    && hardwareConcurrency >= 6
    && devicePixelRatio <= 2.5
  ) {
    recommendedQuality = 'high';
    tier = 'discrete';
    reasons.push('Discrete-class renderer and comfortable CPU/memory hints');
  } else if (integratedRenderer) {
    recommendedQuality = 'medium';
    tier = 'integrated';
    reasons.push('Integrated renderer detected');
  } else {
    recommendedQuality = 'medium';
    tier = 'unknown';
    reasons.push('Renderer class unknown, using balanced defaults');
  }

  return {
    recommendedQuality,
    tier,
    reasons,
    renderer: webgl.renderer,
    vendor: webgl.vendor,
    webglAvailable: webgl.webglAvailable,
    maxTextureSize: webgl.maxTextureSize,
    maxRenderbufferSize: webgl.maxRenderbufferSize,
    hardwareConcurrency,
    deviceMemory,
    devicePixelRatio,
    isMobile,
    softwareRenderer,
    integratedRenderer,
    discreteRenderer,
  };
}
