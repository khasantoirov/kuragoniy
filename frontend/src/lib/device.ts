/**
 * User-Agent Client Hints for the sessions list and "new device" notices
 * ("Samsung Galaxy A52 · Android 13 · Chrome 141"). Chrome hides the phone
 * model and the real OS version from the plain User-Agent, so they're read
 * once here and sent as the X-Device header on sign-in and token refresh
 * (backend common/useragent.py). Browsers without the API (Firefox,
 * Safari) send nothing and are described from the User-Agent alone.
 */
type UAData = { getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>> }

let header = ''

export const deviceReady: Promise<void> = (async () => {
  const params = new URLSearchParams()
  try {
    const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData
    if (data?.getHighEntropyValues) {
      const v = await data.getHighEntropyValues(['model', 'platformVersion', 'formFactors'])
      if (typeof v.model === 'string' && v.model) params.set('model', v.model)
      if (typeof v.platformVersion === 'string' && v.platformVersion) params.set('pv', v.platformVersion)
      if (typeof v.platform === 'string' && v.platform) params.set('p', v.platform)
      if (Array.isArray(v.formFactors) && v.formFactors.length) params.set('ff', v.formFactors.join(','))
    }
  } catch {
    // Hints are a nicety — the User-Agent still gives browser and system.
  }
  // iPadOS asks for desktop sites and calls itself a Mac; touch gives it away.
  if (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) params.set('tp', String(navigator.maxTouchPoints))
  header = params.toString()
})()

export function deviceHeader() {
  return header
}
