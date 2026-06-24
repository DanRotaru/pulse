<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
// Two layout variants. Switch the import below to compare:
//   Dashboard       -> Claude & Codex stacked full-width (alternative)
//   DashboardSplit  -> Claude & Codex side by side, 50% each (active)
import DashboardSplit from './DashboardSplit.vue'
// import Dashboard from './Dashboard.vue'

const PASSWORD_LENGTH = 5
const STORAGE_KEY = 'dashboardPassword'

const digits = ref(Array(PASSWORD_LENGTH).fill(''))
const inputRefs = ref([])
const authPassword = ref('')
const status = ref('locked')
const error = ref('')

const enteredPassword = computed(() => digits.value.join(''))
const isChecking = computed(() => status.value === 'checking')
const isUnlocked = computed(() => status.value === 'unlocked')

function setInputRef(el, index) {
  if (el) inputRefs.value[index] = el
}

function focusInput(index) {
  nextTick(() => inputRefs.value[index]?.focus())
}

function resetDigits() {
  digits.value = Array(PASSWORD_LENGTH).fill('')
  focusInput(0)
}

async function authenticate(password, { silent = false } = {}) {
  status.value = 'checking'
  error.value = ''

  try {
    const res = await fetch('/api/auth', {
      headers: { 'x-dashboard-password': password },
    })

    if (!res.ok) throw new Error('unauthorized')

    authPassword.value = password
    localStorage.setItem(STORAGE_KEY, password)
    status.value = 'unlocked'
  } catch (err) {
    localStorage.removeItem(STORAGE_KEY)
    authPassword.value = ''
    status.value = 'locked'
    if (!silent) {
      error.value = 'Incorrect password'
      resetDigits()
    }
  }
}

function maybeSubmit() {
  if (enteredPassword.value.length === PASSWORD_LENGTH && !isChecking.value) {
    authenticate(enteredPassword.value)
  }
}

function applyDigits(value, startIndex = 0) {
  const clean = value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH - startIndex)
  for (let i = 0; i < clean.length; i++) {
    digits.value[startIndex + i] = clean[i]
  }
  focusInput(Math.min(startIndex + clean.length, PASSWORD_LENGTH - 1))
  maybeSubmit()
}

function onInput(event, index) {
  const clean = event.target.value.replace(/\D/g, '')

  if (clean.length > 1) {
    applyDigits(clean, index)
    return
  }

  digits.value[index] = clean
  if (clean && index < PASSWORD_LENGTH - 1) focusInput(index + 1)
  maybeSubmit()
}

function onKeydown(event, index) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    focusInput(index - 1)
  }
}

function onPaste(event, index) {
  event.preventDefault()
  applyDigits(event.clipboardData?.getData('text') || '', index)
}

onMounted(() => {
  const storedPassword = localStorage.getItem(STORAGE_KEY)
  if (storedPassword) {
    authenticate(storedPassword, { silent: true })
  } else {
    focusInput(0)
  }
})
</script>

<template>
  <DashboardSplit v-if="isUnlocked" :auth-password="authPassword" />
  <!-- <Dashboard /> -->
  <main v-else class="auth-screen">
    <form class="auth-panel" @submit.prevent>
      <label class="auth-label" for="password-0">Password</label>
      <div class="otp-row" :class="{ checking: isChecking }">
        <input
          v-for="(_, index) in digits"
          :id="index === 0 ? 'password-0' : undefined"
          :key="index"
          :ref="(el) => setInputRef(el, index)"
          v-model="digits[index]"
          class="otp-input"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          maxlength="1"
          :disabled="isChecking"
          @input="onInput($event, index)"
          @keydown="onKeydown($event, index)"
          @paste="onPaste($event, index)"
        />
      </div>
      <p v-if="error" class="auth-error">{{ error }}</p>
    </form>
  </main>
</template>

<style scoped>
.auth-screen {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-panel {
  width: min(100%, 360px);
}

.auth-label {
  display: block;
  margin-bottom: 10px;
  color: var(--text);
  font-size: 18px;
  font-style: italic;
}

.otp-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.otp-row.checking {
  opacity: 0.55;
}

.otp-input {
  width: 100%;
  height: 46px;
  border: 2px solid #d0d5dc;
  border-radius: 5px;
  background: #fff;
  color: var(--text);
  font: 20px/1 inherit;
  text-align: center;
  font-variant-numeric: tabular-nums;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.otp-input:focus {
  border-color: var(--cpu);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.auth-error {
  margin-top: 10px;
  min-height: 18px;
  color: #c2410c;
  font-size: 13px;
}
</style>
