/* Relay phone remote client. Plain ES2019 so older phone browsers can run it. */
;(function () {
  'use strict'

  var TOKEN_KEY = 'relay.token'
  var byId = function (id) {
    return document.getElementById(id)
  }

  var state = { snapshot: null, appQuery: '', pane: 'remote', busyPackage: null }
  var stream = null
  var toastTimer = null

  /* ---------------- token handling ---------------- */

  function readTokenFromUrl() {
    var match = /[?&]t=([^&#]+)/.exec(window.location.search || '')
    return match ? decodeURIComponent(match[1]) : ''
  }

  function storedToken() {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || ''
    } catch (error) {
      return ''
    }
  }

  function saveToken(token) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
    } catch (error) {
      /* Private browsing: the token still lives in memory for this session. */
    }
  }

  var token = readTokenFromUrl() || storedToken()

  if (readTokenFromUrl()) {
    saveToken(token)
    // Keep the code out of the address bar once it is stored.
    window.history.replaceState({}, '', window.location.pathname)
  }

  /* ---------------- transport ---------------- */

  function request(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body
        ? { 'Content-Type': 'application/json', 'X-Relay-Token': token }
        : { 'X-Relay-Token': token },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      if (response.status === 401) {
        showGate('That code was not accepted.')
        throw new Error('unauthorized')
      }

      return response.json().then(function (payload) {
        if (!response.ok) {
          throw new Error(payload && payload.error ? payload.error : 'Request failed.')
        }
        return payload
      })
    })
  }

  function openStream() {
    if (stream) {
      stream.close()
    }

    stream = new EventSource('/api/events?t=' + encodeURIComponent(token))
    stream.onmessage = function (event) {
      applySnapshot(JSON.parse(event.data))
    }
    stream.onerror = function () {
      setConnectionDot('is-down', 'Reconnecting to the desktop app…')
    }
  }

  /* ---------------- gate ---------------- */

  function showGate(message) {
    byId('gate').hidden = false
    byId('app').hidden = true
    byId('gate-error').textContent = message || ''

    if (stream) {
      stream.close()
      stream = null
    }
  }

  function showApp() {
    byId('gate').hidden = true
    byId('app').hidden = false
  }

  byId('gate-form').addEventListener('submit', function (event) {
    event.preventDefault()
    var value = byId('gate-input').value.trim().toUpperCase()

    if (!value) {
      return
    }

    token = value
    request('/api/snapshot')
      .then(function (snapshot) {
        saveToken(token)
        showApp()
        applySnapshot(snapshot)
        openStream()
      })
      .catch(function () {
        /* showGate already reported the failure. */
      })
  })

  /* ---------------- rendering ---------------- */

  function setConnectionDot(className, detail) {
    byId('status-dot').className = 'dot ' + className
    if (detail) {
      byId('device-detail').textContent = detail
    }
  }

  function applySnapshot(snapshot) {
    state.snapshot = snapshot

    var connection = snapshot.connectionState || {}
    var device = snapshot.device
    var connected = connection.status === 'connected'
    var backend = snapshot.activeBackend === 'native' ? 'Native Remote' : 'ADB'

    byId('device-name').textContent = device ? device.name : 'No TV connected'

    if (connected) {
      setConnectionDot('is-live', device.host + ' · ' + backend)
    } else if (connection.status === 'connecting' || connection.status === 'pairing') {
      setConnectionDot('is-busy', 'Connecting…')
    } else {
      setConnectionDot(
        'is-down',
        connection.message || 'Connect a TV from the desktop app first'
      )
    }

    renderApps()
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase()
      })
      .join('')
  }

  /** Stable per-package hue so icon-less apps stay distinguishable. */
  function hueFor(packageName) {
    var hash = 0

    for (var index = 0; index < packageName.length; index += 1) {
      hash = (hash * 31 + packageName.charCodeAt(index)) >>> 0
    }

    return hash % 360
  }

  function visibleApps() {
    var snapshot = state.snapshot
    if (!snapshot) {
      return []
    }

    var query = state.appQuery.trim().toLowerCase()
    var apps = snapshot.apps.filter(function (app) {
      if (!query) {
        return true
      }
      return (
        app.displayName.toLowerCase().indexOf(query) !== -1 ||
        app.packageName.toLowerCase().indexOf(query) !== -1
      )
    })

    var recents = snapshot.recentApps || []
    return apps.sort(function (left, right) {
      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1
      }

      var leftRecent = recents.indexOf(left.packageName)
      var rightRecent = recents.indexOf(right.packageName)

      if (leftRecent !== rightRecent) {
        return (leftRecent === -1 ? 99 : leftRecent) - (rightRecent === -1 ? 99 : rightRecent)
      }

      return left.displayName.localeCompare(right.displayName)
    })
  }

  function renderApps() {
    var grid = byId('app-grid')
    var empty = byId('app-empty')
    var apps = visibleApps()

    grid.textContent = ''

    if (apps.length === 0) {
      var snapshot = state.snapshot
      empty.textContent = !snapshot || !snapshot.device
        ? 'Connect a TV from the desktop app to browse its apps.'
        : state.appQuery
          ? 'No apps match that search.'
          : 'No apps cached yet. Tap refresh to build the list.'
      return
    }

    empty.textContent = ''

    apps.forEach(function (app) {
      var card = document.createElement('button')
      card.type = 'button'
      card.className = 'app-card' + (state.busyPackage === app.packageName ? ' is-busy' : '')
      card.setAttribute('data-package', app.packageName)

      if (app.hasIcon) {
        var img = document.createElement('img')
        img.src = '/api/icon?package=' + encodeURIComponent(app.packageName) + '&t=' + encodeURIComponent(token)
        img.alt = ''
        img.loading = 'lazy'
        card.appendChild(img)
      } else {
        var fallback = document.createElement('div')
        fallback.className = 'fallback'
        fallback.style.setProperty('--hue', String(hueFor(app.packageName)))
        fallback.textContent = initials(app.displayName)
        card.appendChild(fallback)
      }

      var label = document.createElement('span')
      label.textContent = app.displayName
      card.appendChild(label)

      if (app.favorite) {
        var pin = document.createElement('em')
        pin.className = 'pin'
        pin.textContent = '★'
        card.appendChild(pin)
      }

      grid.appendChild(card)
    })
  }

  function toast(message, isError) {
    var element = byId('toast')
    element.textContent = message
    element.className = 'toast is-visible' + (isError ? ' is-error' : '')

    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(function () {
      element.className = 'toast'
    }, isError ? 3200 : 1600)
  }

  /** The gate already took over for a 401, so that case stays silent. */
  function reportError(error) {
    if (error && error.message !== 'unauthorized') {
      toast(error.message, true)
    }
  }

  function buzz(duration) {
    if (navigator.vibrate) {
      navigator.vibrate(duration || 8)
    }
  }

  /* ---------------- actions ---------------- */

  function sendKey(command) {
    buzz()
    request('/api/key', { command: command })
      .then(function (payload) {
        var feedback = payload.feedback
        if (feedback && feedback.status === 'blocked') {
          toast(feedback.title, true)
        }
      })
      .catch(reportError)
  }

  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest) {
      return
    }

    var keyTarget = event.target.closest('[data-key]')

    if (keyTarget) {
      sendKey(keyTarget.getAttribute('data-key'))
      return
    }

    var appTarget = event.target.closest('[data-package]')

    if (appTarget) {
      var packageName = appTarget.getAttribute('data-package')
      buzz(12)
      state.busyPackage = packageName
      renderApps()
      request('/api/launch', { packageName: packageName })
        .then(function () {
          toast('Launching…')
        })
        .catch(reportError)
        .then(function () {
          state.busyPackage = null
          renderApps()
        })
      return
    }

    var tab = event.target.closest('[data-pane]')
    if (tab) {
      selectPane(tab.getAttribute('data-pane'))
    }
  })

  byId('power').addEventListener('click', function () {
    sendKey('power')
  })

  byId('wake').addEventListener('click', function (event) {
    event.stopPropagation()
    buzz(12)
    request('/api/wake', {})
      .then(function () {
        toast('Wake sent')
      })
      .catch(reportError)
  })

  byId('app-refresh').addEventListener('click', function () {
    buzz(12)
    toast('Refreshing apps…')
    request('/api/apps/refresh', {})
      .then(function (snapshot) {
        applySnapshot(snapshot)
        toast('Apps updated')
      })
      .catch(reportError)
  })

  byId('app-search').addEventListener('input', function (event) {
    state.appQuery = event.target.value
    renderApps()
  })

  byId('type-send').addEventListener('click', function () {
    var input = byId('type-input')
    var text = input.value

    if (!text) {
      return
    }

    buzz(12)
    request('/api/text', { text: text })
      .then(function () {
        input.value = ''
        toast('Text sent')
      })
      .catch(reportError)
  })

  byId('type-clear').addEventListener('click', function () {
    byId('type-input').value = ''
  })

  function selectPane(name) {
    state.pane = name

    Array.prototype.forEach.call(document.querySelectorAll('.pane'), function (pane) {
      pane.classList.toggle('is-active', pane.id === 'pane-' + name)
    })

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var active = tab.getAttribute('data-pane') === name
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
  }

  /* Swipe on the d-pad so flicking works like a trackpad. */
  ;(function enableSwipe() {
    var pad = document.querySelector('.dpad')
    var start = null

    pad.addEventListener(
      'touchstart',
      function (event) {
        start = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() }
      },
      { passive: true }
    )

    pad.addEventListener(
      'touchend',
      function (event) {
        if (!start) {
          return
        }

        var touch = event.changedTouches[0]
        var deltaX = touch.clientX - start.x
        var deltaY = touch.clientY - start.y
        var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        var elapsed = Date.now() - start.time
        start = null

        // Below the threshold this is a tap, and the click handler owns it.
        if (distance < 42 || elapsed > 600) {
          return
        }

        event.preventDefault()

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          sendKey(deltaX > 0 ? 'right' : 'left')
        } else {
          sendKey(deltaY > 0 ? 'down' : 'up')
        }
      },
      { passive: false }
    )
  })()

  /* Reconnect the event stream when the phone comes back from sleep. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !byId('app').hidden) {
      request('/api/snapshot').then(applySnapshot).catch(function () {})
      openStream()
    }
  })

  /* ---------------- boot ---------------- */

  if (!token) {
    showGate('')
  } else {
    request('/api/snapshot')
      .then(function (snapshot) {
        showApp()
        applySnapshot(snapshot)
        openStream()
      })
      .catch(function () {
        /* showGate already ran for a 401. */
      })
  }
})()
