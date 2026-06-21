const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const MIN_DELAY_MS = 1000

// Keywords that identify protected licenses (DLC, soundtracks, etc.)
const PROTECTED_KEYWORDS = ['dlc', 'soundtrack', 'expansion', 'season pass']

// Extract the Steam session ID from inline page scripts (Manifest V3 isolation workaround).
// Only searches scripts without a `src` attribute (inline scripts).
function getSteamSessionId(): string | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script:not([src])')
  for (const script of scripts) {
    const match = script.textContent?.match(/g_sessionID\s*=\s*"([^"]+)"/)
    if (match) return match[1]
  }
  return null
}

// Safety heuristic: skip licenses that look like DLC, soundtracks, or other protected content
function isProtectedLicense(elementText: string): boolean {
  const text = elementText.toLowerCase()
  return PROTECTED_KEYWORDS.some((keyword) => text.includes(keyword))
}

function buildLinkMap(): Map<string, HTMLAnchorElement> {
  const allRemoveLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href^="javascript:RemoveFreeLicense"]',
  )
  const linkMap = new Map<string, HTMLAnchorElement>()

  allRemoveLinks.forEach((link) => {
    const match = link.href.match(/RemoveFreeLicense\(\s*(\d+),\s*'.*?'\s*\)/)
    if (match?.[1]) {
      linkMap.set(match[1], link)
    }
  })

  return linkMap
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Almost done...'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.ceil(totalSeconds % 60)
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || h > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

function createDashboard(): HTMLDivElement {
  const dashboard = document.createElement('div')
  dashboard.id = 'sww-dashboard'
  dashboard.style.cssText = `
    position: fixed; bottom: 30px; right: 30px;
    background: #171a21; color: #c6d4df;
    padding: 20px; border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.9);
    font-family: Arial, sans-serif; z-index: 999999;
    border: 1px solid #2a475e; min-width: 340px;
  `
  document.body.appendChild(dashboard)
  return dashboard
}

function updateUI(
  dashboard: HTMLDivElement,
  done: number,
  total: number,
  totalRealTargets: number,
  realTargetsDone: number,
  totalActiveDuration: number,
  currentId: string | null,
  extraWaitSecs = 0,
  statusMsg = '',
): void {
  const percent = ((done / total) * 100).toFixed(1)
  const remainingRealItems = totalRealTargets - realTargetsDone
  const avgTimePerItem =
    realTargetsDone > 0 ? totalActiveDuration / realTargetsDone : MIN_DELAY_MS / 1000

  const etaSeconds = remainingRealItems * avgTimePerItem + extraWaitSecs
  const etaStr = done < total ? formatTime(etaSeconds) : 'Completed'

  dashboard.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
    ${statusMsg}
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
      <span><strong>Progress:</strong></span>
      <span>${done} / ${total} (${percent}%)</span>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
      <span><strong>ETA:</strong></span>
      <span style="color: #e5a822;">~ ${etaStr}</span>
    </div>
    <div style="width: 100%; background: #000; height: 12px; border-radius: 6px; overflow: hidden; border: 1px solid #333;">
      <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #1a9bdc, #66c0f4); transition: width 0.3s ease-out;"></div>
    </div>
    <div style="font-size: 11px; color: #8f98a0; margin-top: 15px; display: flex; justify-content: space-between;">
      <span>Speed: ${realTargetsDone > 0 ? (1 / avgTimePerItem).toFixed(2) : '---'} it/s</span>
      <span>ID: ${currentId ?? '---'}</span>
    </div>
  `
}

async function removeTrashLicenses(trashPackageIds: string[]): Promise<void> {
  const trashSet = new Set(trashPackageIds)
  const linkMap = buildLinkMap()

  const targets = Array.from(trashSet)
  const totalTargets = targets.length

  if (totalTargets === 0) {
    alert('Your trash list is empty!')
    return
  }

  const totalRealTargets = targets.filter((id) => linkMap.has(id)).length
  let realTargetsDone = 0
  let totalActiveDuration = 0

  const dashboard = createDashboard()

  updateUI(dashboard, 0, totalTargets, totalRealTargets, realTargetsDone, totalActiveDuration, null)

  let processedCount = 0

  for (const currentPackageId of targets) {
    processedCount++

    if (!linkMap.has(currentPackageId)) {
      updateUI(
        dashboard,
        processedCount,
        totalTargets,
        totalRealTargets,
        realTargetsDone,
        totalActiveDuration,
        currentPackageId,
        0,
        `<div style="background: rgba(102, 192, 244, 0.1); border: 1px solid #2a475e; padding: 6px; border-radius: 4px; color: #8f98a0; margin-bottom: 15px; text-align: center; font-size: 13px;">
          ℹ️ ID ${currentPackageId} not on page &rarr; Skipped
        </div>`,
      )
      continue
    }

    const link = linkMap.get(currentPackageId)!

    // Skip DLC, soundtracks and other protected licenses
    const row = link.closest('tr')
    if (row && isProtectedLicense(row.textContent ?? '')) {
      updateUI(
        dashboard,
        processedCount,
        totalTargets,
        totalRealTargets,
        realTargetsDone,
        totalActiveDuration,
        currentPackageId,
        0,
        `<div style="background: rgba(164, 208, 7, 0.1); border: 1px solid #a4d007; padding: 6px; border-radius: 4px; color: #a4d007; margin-bottom: 15px; text-align: center; font-size: 13px;">
          🛡️ ID ${currentPackageId} looks protected (DLC/Soundtrack) &rarr; Skipped
        </div>`,
      )
      continue
    }

    let successStatus = false

    const sessionId = getSteamSessionId()
    if (!sessionId) {
      dashboard.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
        <div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 10px; border-radius: 4px; color: #e54022; text-align: center; font-weight: bold;">
          ❌ Could not find Steam session ID.<br>Please reload the page and try again.
        </div>
      `
      return
    }

    const formData = new URLSearchParams()
    formData.append('sessionid', sessionId)
    formData.append('packageid', currentPackageId)

    while (!successStatus) {
      try {
        const startTimestamp = performance.now()

        const response = await fetch('https://store.steampowered.com/account/removelicense', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          let data: { success: number } | null = null
          try {
            data = await response.json()
          } catch (e) {
            console.error('Could not parse response as JSON.', e)
            data = { success: 0 }
          }

          if (data?.success === 1) {
            // EResult 1 = OK
            successStatus = true
            if (row) row.style.display = 'none'

            const elapsedMs = performance.now() - startTimestamp
            const timeToWait = Math.max(0, MIN_DELAY_MS - elapsedMs)

            if (processedCount < totalTargets && timeToWait > 0) {
              await sleep(timeToWait)
            }

            const totalCycleTime = elapsedMs + timeToWait
            totalActiveDuration += totalCycleTime / 1000
            realTargetsDone++

            updateUI(
              dashboard,
              processedCount,
              totalTargets,
              totalRealTargets,
              realTargetsDone,
              totalActiveDuration,
              currentPackageId,
            )
          } else if (data?.success === 84) {
            // EResult 84 = RateLimitExceeded (Backend Ban)
            const waitTimeSecs = 3600
            console.warn(
              `🛑 Backend ban (EResult 84) for ID ${currentPackageId}! Pausing for 1 hour.`,
            )

            chrome.runtime.sendMessage({ type: 'NOTIFY_BAN' })

            for (let i = waitTimeSecs; i > 0; i--) {
              updateUI(
                dashboard,
                processedCount - 1,
                totalTargets,
                totalRealTargets,
                realTargetsDone,
                totalActiveDuration,
                currentPackageId,
                i,
                `<div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 10px; border-radius: 4px; color: #e54022; margin-bottom: 15px; text-align: center; font-weight: bold; font-size: 13px;">
                  🛑 Backend limit reached (Code 84)!<br>Pausing for 1 hour...<br>Waiting ${i} more seconds.
                </div>`,
              )
              await sleep(1000)
            }

            updateUI(
              dashboard,
              processedCount - 1,
              totalTargets,
              totalRealTargets,
              realTargetsDone,
              totalActiveDuration,
              currentPackageId,
            )
          } else {
            // Some other Steam error code
            console.error(
              `❌ Steam backend error for ID ${currentPackageId} (Code: ${data?.success})`,
            )
            successStatus = true
          }
        } else if (response.status === 429) {
          // Classic edge rate limit
          const retryAfterHeader = response.headers.get('Retry-After')
          let waitTime = parseInt(retryAfterHeader ?? '', 10)
          if (isNaN(waitTime) || waitTime <= 0) waitTime = 60

          for (let i = waitTime; i > 0; i--) {
            updateUI(
              dashboard,
              processedCount - 1,
              totalTargets,
              totalRealTargets,
              realTargetsDone,
              totalActiveDuration,
              currentPackageId,
              i,
              `<div style="background: rgba(229, 168, 34, 0.2); border: 1px solid #e5a822; padding: 10px; border-radius: 4px; color: #e5a822; margin-bottom: 15px; text-align: center; font-weight: bold;">
                ⚠️ Network limit (429)!<br>Waiting ${i} seconds...
              </div>`,
            )
            await sleep(1000)
          }

          updateUI(
            dashboard,
            processedCount - 1,
            totalTargets,
            totalRealTargets,
            realTargetsDone,
            totalActiveDuration,
            currentPackageId,
          )
        } else {
          console.error(
            `❌ HTTP error for ID ${currentPackageId} (Status: ${response.status})`,
          )
          successStatus = true
        }
      } catch (error) {
        console.error(`❌ Network error for ID ${currentPackageId}:`, error)
        await sleep(5000)
      }
    }
  }

  dashboard.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #2a475e; color: #a4d007; font-weight: bold; text-align: center; font-size: 16px;">
      ✅ Process complete! <br><br>
      <span style="font-size: 13px; color: #c6d4df; font-weight: normal;">
        Processed ${totalTargets} ID(s) in total.<br>Reload the page (F5).
      </span>
    </div>
  `
}

// Listen for messages from the popup to start the cleanup
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'START_CLEANUP' && Array.isArray(request.ids)) {
    removeTrashLicenses(request.ids as string[])
  }
})
