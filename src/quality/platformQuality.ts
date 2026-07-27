import type {
  PlatformQualityReport,
  QualityPresetKey,
} from '../core/types';

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software|basic render|mesa offscreen|warp/i;
const INTEGRATED_RENDERER_PATTERN = /intel|uhd|iris|vega|radeon graphics|adreno|mali|powervr/i;
const DISCRETE_RENDERER_PATTERN = /nvidia|geforce|rtx|gtx|radeon rx|rx\s?\d|intel\(r\) arc|apple m\d|apple gpu/i;
const MOBILE_PATTERN = /android|iphone|ipad|ipod|mobile/i;

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

interface WebGlDetails {
  webglAvailable: boolean;
  vendor: string;
  renderer: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
}

function readWebGlDetails(): WebGlDetails {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');

  if (gl === null) {
    return {
      webglAvailable: false,
      vendor: 'unknown',
      renderer: 'unavailable',
      maxTextureSize: 0,
      maxRenderbufferSize: 0,
    };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const vendorParameter = debugInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR;
  const rendererParameter = debugInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER;
  const details = {
    webglAvailable: true,
    vendor: String(gl.getParameter(vendorParameter) ?? 'unknown'),
    renderer: String(gl.getParameter(rendererParameter) ?? 'unknown'),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0),
    maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 0),
  };

  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return details;
}

export function detectPlatformQuality(): PlatformQualityReport {
  const webgl = readWebGlDetails();
  const rendererText = `${webgl.vendor} ${webgl.renderer}`;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 0;
  const deviceMemory = Number((navigator as NavigatorWithMemory).deviceMemory ?? 0);
  const devicePixelRatio = window.devicePixelRatio || 1;
  const isMobile = MOBILE_PATTERN.test(navigator.userAgent)
    || navigator.maxTouchPoints > 1;
  const softwareRenderer = SOFTWARE_RENDERER_PATTERN.test(rendererText)
    || !webgl.webglAvailable;
  const integratedRenderer = INTEGRATED_RENDERER_PATTERN.test(rendererText);
  const discreteRenderer = DISCRETE_RENDERER_PATTERN.test(rendererText);
  const reasons: string[] = [];
  let recommendedQuality: QualityPresetKey = 'medium';
  let tier: PlatformQualityReport['tier'] = 'unknown';

  if (softwareRenderer) {
    recommendedQuality = 'low';
    tier = 'software';
    reasons.push('Software or unavailable WebGL renderer');
  } else if (
    isMobile
    || (deviceMemory > 0 && deviceMemory <= 4)
    || (hardwareConcurrency > 0 && hardwareConcurrency <= 4)
    || (webgl.maxTextureSize > 0 && webgl.maxTextureSize < 8192)
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
