<template>
  <q-page class="draft-page q-pa-md">
    <div class="page-header q-mb-md">
      <div>
        <div class="text-h4 text-weight-bold">Xpression Draft Viewer</div>
        <div class="text-caption text-grey-5">
          Polling generic endpoint:
          <span class="text-white text-weight-bold">/xpression/draft</span>
        </div>
      </div>

      <div class="row items-center q-gutter-sm">
        <q-badge
          :color="isPolling ? 'positive' : 'grey-7'"
          :label="isPolling ? 'POLLING' : 'STOPPED'"
        />

        <q-btn
          color="primary"
          icon="refresh"
          label="Refresh"
          :loading="loading"
          @click="loadDraft"
        />

        <q-btn
          v-if="isViewMode === '9004'"
          :color="isPolling ? 'negative' : 'positive'"
          :icon="isPolling ? 'pause' : 'play_arrow'"
          :label="isPolling ? 'Stop Polling' : 'Start Polling'"
          @click="isPolling ? stopPolling() : startPolling()"
        />

        <q-btn
          color="grey-8"
          icon="arrow_back"
          label="Back"
          @click="router.back()"
        />
      </div>
    </div>

    <q-card flat bordered class="status-card q-mb-md">
      <q-card-section>
        <div class="status-grid">
          <div>
            <div class="status-label">Current Round</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.current_round ?? '-' }}
            </div>
          </div>

          <div>
            <div class="status-label">Phase</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.phase || '-' }}
            </div>
          </div>

          <div>
            <div class="status-label">Active Side</div>
            <div class="status-value">
              {{ activeSideLabel }}
            </div>
          </div>

          <div>
            <div class="status-label">Completed</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.completed_steps ?? lockedCount }}
              /
              {{ xpressionDraft?.meta?.total_steps ?? draftSlots.length }}
            </div>
          </div>

          <div>
            <div class="status-label">Timer</div>
            <div class="status-value">
              {{ xpressionDraft?.Timer?.remaining ?? 25 }}s
            </div>
          </div>

          <div>
            <div class="status-label">Last Updated</div>
            <div class="status-value small">
              {{ lastUpdatedLabel }}
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="draft-card q-mb-md">
      <q-card-section>
        <div class="draft-header q-mb-md">
          <div>
            <div class="text-h6 text-weight-bold">Xpression Draft Payload</div>
            <div class="text-caption text-grey-5">
              Viewer only — display follows /xpression/draft
            </div>
          </div>
        </div>

        <div class="draft-layout">
          <div class="team-panel blue-panel">
            <div class="team-title">BLUE</div>

            <div class="phase-section">
              <div class="phase-title">Picks</div>
              <div class="slot-grid">
                <DraftSlot
                  v-for="draftSlot in bluePicks"
                  :key="`blue-pick-${draftSlot.slot}-${draftSlot.round}`"
                  :draft-slot="draftSlot"
                />
              </div>
            </div>

            <div class="phase-section">
              <div class="phase-title">Bans</div>
              <div class="slot-grid bans">
                <DraftSlot
                  v-for="draftSlot in blueBans"
                  :key="`blue-ban-${draftSlot.slot}-${draftSlot.round}`"
                  :draft-slot="draftSlot"
                />
              </div>
            </div>
          </div>

          <div class="center-panel">
            <div class="map-box">
              <div class="map-label">Map</div>
              <div class="map-name">
                {{ mapName }}
              </div>
              <div class="map-mode">
                {{ mapMode }}
              </div>
            </div>

            <div class="current-box">
              <div class="map-label">Current</div>
              <div class="current-phase">
                {{ xpressionDraft?.meta?.phase || '-' }}
              </div>
              <div class="current-camp">
                {{ activeSideLabel }}
              </div>
            </div>

            <div class="timer-box">
              <div class="timer-number">
                {{ xpressionDraft?.Timer?.remaining ?? 25 }}
              </div>
              <div class="map-label">Seconds Remaining</div>
            </div>
          </div>

          <div class="team-panel red-panel">
            <div class="team-title">RED</div>

            <div class="phase-section">
              <div class="phase-title">Picks</div>
              <div class="slot-grid">
                <DraftSlot
                  v-for="draftSlot in redPicks"
                  :key="`red-pick-${draftSlot.slot}-${draftSlot.round}`"
                  :draft-slot="draftSlot"
                />
              </div>
            </div>

            <div class="phase-section">
              <div class="phase-title">Bans</div>
              <div class="slot-grid bans">
                <DraftSlot
                  v-for="draftSlot in redBans"
                  :key="`red-ban-${draftSlot.slot}-${draftSlot.round}`"
                  :draft-slot="draftSlot"
                />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="raw-card" v-if="isViewMode === '9004'">
      <q-expansion-item
        dark
        dense
        icon="data_object"
        label="Debug / Raw /xpression/draft Payload"
      >
        <pre>{{ JSON.stringify(xpressionDraft, null, 2) }}</pre>
      </q-expansion-item>
    </q-card>
  </q-page>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { api } from 'boot/axios'

const $q = useQuasar()
const router = useRouter()

const isViewMode = window.location.port

const loading = ref(false)
const isPolling = ref(false)
const xpressionDraft = ref(buildBlankXpressionDraft())
const lastUpdatedAt = ref(null)
const pollTimer = ref(null)

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return '-'
  return new Date(lastUpdatedAt.value).toLocaleTimeString()
})

const draftSlots = computed(() => {
  const slots = xpressionDraft.value?.Draft
  return Array.isArray(slots) ? slots : []
})

const lockedCount = computed(() => {
  return draftSlots.value.filter((slot) => slot.locked).length
})

const bluePicks = computed(() => getSlotsByCampAndType(1, 'PICK'))
const blueBans = computed(() => getSlotsByCampAndType(1, 'BAN'))
const redPicks = computed(() => getSlotsByCampAndType(2, 'PICK'))
const redBans = computed(() => getSlotsByCampAndType(2, 'BAN'))

const activeSideLabel = computed(() => {
  const meta = xpressionDraft.value?.meta || {}

  if (meta.active_side) return meta.active_side
  return getCampLabel(meta.active_camp)
})

const mapName = computed(() => {
  const map = xpressionDraft.value?.Map || {}
  return map.map_name || map.name || '-'
})

const mapMode = computed(() => {
  const map = xpressionDraft.value?.Map || {}
  return map.map_mode || map.mode || '-'
})

const DraftSlot = defineComponent({
  name: 'DraftSlot',
  props: {
    draftSlot: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const draftSlot = props.draftSlot || {}
      const hero = draftSlot.hero || {}

      return h(
        'div',
        {
          class: [
            'draft-slot',
            String(draftSlot.type || '').toLowerCase(),
            draftSlot.locked ? 'locked' : 'empty',
            draftSlot.is_no_selection ? 'no-selection' : '',
          ],
        },
        [
          h('div', { class: 'slot-top' }, [
            h('span', draftSlot.slot || '-'),
            h('span', draftSlot.type || '-'),
          ]),

          h('div', { class: 'hero-frame' }, [
            h('img', {
              class: 'hero-img',
              src: getHeroImage(hero),
              alt: hero.name || 'Hero',
              onError: (event) => {
                event.target.src = '/imgs/heroes/empty.png'
              },
            }),
          ]),

          h('div', { class: 'hero-name' }, getDisplayHeroName(hero, draftSlot)),
          h('div', { class: 'hero-role' }, hero.role || 'Unknown'),
        ],
      )
    }
  },
})

function getSlotsByCampAndType(camp, type) {
  return draftSlots.value
    .filter((slot) => {
      return (
        Number(slot.camp) === Number(camp) &&
        String(slot.type).toUpperCase() === String(type).toUpperCase()
      )
    })
    .sort((a, b) => {
      const aIndex = getSlotSortIndex(a)
      const bIndex = getSlotSortIndex(b)

      if (aIndex !== bIndex) return aIndex - bIndex

      return Number(a.round || 0) - Number(b.round || 0)
    })
}

function getSlotSortIndex(slot = {}) {
  const label = String(slot.slot || '')
  const match = label.match(/(\d+)/)

  if (match) return Number(match[1])

  return Number(slot.round || 0)
}

function getDisplayHeroName(hero = {}, draftSlot = {}) {
  const id = Number(hero.id || 0)
  const type = String(draftSlot.type || '').toUpperCase()

  if (!id && draftSlot.locked) {
    if (type === 'PICK') return 'NO PICK'
    if (type === 'BAN') return 'NO BAN'
  }

  return hero.name || 'Hero 0'
}

function toHeroFileName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
}

function getHeroImage(hero = {}) {
  if (hero?.image) return hero.image

  const id = Number(hero?.id || 0)

  if (!id) {
    return '/imgs/heroes/empty.png'
  }

  const imageId = getHeroBaseId(id)
  const name = hero?.name || `Hero ${id}`

  return `/imgs/heroes/${imageId}_${toHeroFileName(name)}.png`
}

function getHeroBaseId(heroId) {
  const id = Number(heroId)

  if (id === 10571 || id === 10572 || id === 10573) {
    return 1057
  }

  return id
}

function getCampLabel(camp) {
  if (camp === 'BOTH') return 'Both'
  if (Number(camp) === 1) return 'Blue'
  if (Number(camp) === 2) return 'Red'
  return '-'
}

function buildEmptyDraftSkeleton() {
  return [
    {
      round: 0,
      type: 'BAN',
      camp: 2,
      slot: 'Red 1',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 0,
      type: 'BAN',
      camp: 1,
      slot: 'Blue 1',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 1,
      type: 'PICK',
      camp: 1,
      slot: 'Blue 2',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 2,
      type: 'BAN',
      camp: 2,
      slot: 'Red 2',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 3,
      type: 'PICK',
      camp: 2,
      slot: 'Red 3',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 4,
      type: 'BAN',
      camp: 1,
      slot: 'Blue 3',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 5,
      type: 'BAN',
      camp: 2,
      slot: 'Red 4',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 5,
      type: 'BAN',
      camp: 1,
      slot: 'Blue 4',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 6,
      type: 'PICK',
      camp: 2,
      slot: 'Red 5',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 7,
      type: 'BAN',
      camp: 1,
      slot: 'Blue 5',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 8,
      type: 'PICK',
      camp: 1,
      slot: 'Blue 6',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
    {
      round: 9,
      type: 'BAN',
      camp: 2,
      slot: 'Red 6',
      hero: {
        id: 0,
        name: 'Hero 0',
        role: 'Unknown',
        image: '/imgs/heroes/empty.png',
      },
      locked: false,
      is_no_selection: false,
    },
  ]
}

function buildBlankXpressionDraft() {
  const Draft = buildEmptyDraftSkeleton()

  return {
    Map: {},
    Timer: {
      phase_seconds: 25,
      remaining: 25,
      elapsed: 0,
      is_running: false,
    },
    Draft,
    meta: {
      current_round: -1,
      phase: '-',
      active_camp: null,
      active_side: '-',
      is_complete: false,
      completed_steps: 0,
      total_steps: Draft.length,
    },
    source: 'blank',
  }
}

async function loadDraft() {
  loading.value = true

  try {
    const response = await api.get('/xpression/draft')

    const rawPayload = response.data?.data?.Map
      ? response.data.data
      : response.data || {}

    xpressionDraft.value = normalizeDraftResponse(rawPayload)
    lastUpdatedAt.value = Date.now()
  } catch (err) {
    console.error('Failed to load Xpression draft:', err)

    $q.notify({
      type: 'negative',
      message: 'Failed to load /xpression/draft',
    })
  } finally {
    loading.value = false
  }
}

function normalizeDraftResponse(payload = {}) {
  const Draft = extractDraftSlots(payload)

  return {
    ...payload,

    Draft,

    Timer: {
      phase_seconds: Number(payload.Timer?.phase_seconds ?? 25),
      remaining: Number(payload.Timer?.remaining ?? 25),
      elapsed: Number(payload.Timer?.elapsed ?? 0),
      is_running: Boolean(payload.Timer?.is_running),
    },

    meta: {
      current_round: payload.meta?.current_round ?? -1,
      phase: payload.meta?.phase || '-',
      active_camp: payload.meta?.active_camp ?? null,
      active_side:
        payload.meta?.active_side ||
        getCampLabel(payload.meta?.active_camp),
      is_complete: Boolean(payload.meta?.is_complete),
      completed_steps: Number(
        payload.meta?.completed_steps ??
          Draft.filter((slot) => slot.locked).length,
      ),
      total_steps: Number(payload.meta?.total_steps ?? Draft.length),
    },

    Map: payload.Map || {},
  }
}

function extractDraftSlots(payload = {}) {
  if (Array.isArray(payload.Draft)) {
    return payload.Draft.map(normalizeDraftSlot)
  }

  const slotKeys = Object.keys(payload).filter((key) =>
    /^(blue|red)_\d+$/i.test(key),
  )

  if (!slotKeys.length) {
    return buildEmptyDraftSkeleton()
  }

  return slotKeys
    .map((key) => {
      const rawSlot = payload[key] || {}

      return normalizeDraftSlot({
        ...rawSlot,
        slot: toDisplaySlotName(key),
      })
    })
    .sort((a, b) => getGlobalDraftOrder(a) - getGlobalDraftOrder(b))
}

function normalizeDraftSlot(slot = {}) {
  const hero = slot.hero || {}
  const type = String(slot.type || 'BAN').toUpperCase()
  const locked = Boolean(slot.locked)
  const isNoSelection = Boolean(slot.is_no_selection)

  const heroId = Number(hero.id || 0)

  let heroName = hero.name || 'Hero 0'

  if (!heroId && locked) {
    if (type === 'PICK') heroName = 'NO PICK'
    if (type === 'BAN') heroName = 'NO BAN'
  }

  return {
    round: Number(slot.round ?? 0),
    type,
    camp: Number(slot.camp || 0),
    slot: slot.slot || '-',

    hero: {
      id: heroId,
      name: heroName,
      role: hero.role || (heroId ? 'Unknown' : 'None'),
      image: hero.image,
    },

    locked,
    is_no_selection: isNoSelection || (!heroId && locked),
  }
}

function toDisplaySlotName(key = '') {
  const [side, num] = String(key).split('_')

  if (side === 'blue') return `Blue ${num}`
  if (side === 'red') return `Red ${num}`

  return key
}

function getGlobalDraftOrder(slot = {}) {
  const round = Number(slot.round ?? 0)
  const type = String(slot.type || '').toUpperCase()
  const camp = Number(slot.camp || 0)

  const order = [
    { round: 0, type: 'BAN', camp: 2 },
    { round: 0, type: 'BAN', camp: 1 },

    { round: 1, type: 'PICK', camp: 1 },
    { round: 1, type: 'PICK', camp: 2 },

    { round: 2, type: 'BAN', camp: 2 },
    { round: 2, type: 'BAN', camp: 1 },

    { round: 3, type: 'PICK', camp: 2 },
    { round: 3, type: 'PICK', camp: 1 },

    { round: 4, type: 'BAN', camp: 1 },
    { round: 4, type: 'BAN', camp: 2 },

    { round: 5, type: 'BAN', camp: 2 },
    { round: 5, type: 'BAN', camp: 1 },

    { round: 6, type: 'PICK', camp: 2 },
    { round: 6, type: 'PICK', camp: 1 },

    { round: 7, type: 'BAN', camp: 1 },
    { round: 7, type: 'BAN', camp: 2 },

    { round: 8, type: 'PICK', camp: 1 },
    { round: 8, type: 'PICK', camp: 2 },

    { round: 9, type: 'BAN', camp: 2 },
    { round: 9, type: 'BAN', camp: 1 },
  ]

  const index = order.findIndex((item) => {
    return item.round === round && item.type === type && item.camp === camp
  })

  if (index !== -1) return index

  return round * 10 + camp
}

function startPolling() {
  stopPolling()

  isPolling.value = true
  loadDraft()

  pollTimer.value = setInterval(loadDraft, 500)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }

  isPolling.value = false
}

onMounted(startPolling)
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.draft-page {
  min-height: 100vh;
  background: #111827;
  color: white;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-card,
.draft-card,
.raw-card {
  background: #1f2937;
  color: white;
  border-color: rgba(255, 255, 255, 0.1);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.status-label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-value {
  font-size: 22px;
  font-weight: 800;
}

.status-value.small {
  font-size: 14px;
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.draft-layout {
  display: grid;
  grid-template-columns: 1fr 260px 1fr;
  gap: 16px;
}

.team-panel {
  padding: 14px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.78);
}

.blue-panel {
  box-shadow: inset 4px 0 0 #2563eb;
}

.red-panel {
  box-shadow: inset 4px 0 0 #dc2626;
}

.team-title {
  font-size: 24px;
  font-weight: 900;
  margin-bottom: 14px;
}

.blue-panel .team-title {
  color: #60a5fa;
}

.red-panel .team-title {
  color: #f87171;
}

.phase-section {
  margin-bottom: 18px;
}

.phase-title {
  font-size: 13px;
  font-weight: 800;
  color: #d1d5db;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(90px, 1fr));
  gap: 10px;
}

.slot-grid.bans {
  grid-template-columns: repeat(2, minmax(70px, 1fr));
}

.center-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.map-box,
.current-box,
.timer-box {
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
}

.map-label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.map-name,
.current-phase {
  font-size: 24px;
  font-weight: 900;
  margin-top: 6px;
}

.map-mode,
.current-camp {
  color: #d1d5db;
  font-size: 14px;
}

.timer-number {
  font-size: 56px;
  line-height: 1;
  font-weight: 950;
}

:deep(.draft-slot) {
  position: relative;
  min-height: 180px;
  border-radius: 14px;
  overflow: hidden;
  background: #020617;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

:deep(.draft-slot.pick.locked) {
  border-color: rgba(96, 165, 250, 0.65);
}

:deep(.draft-slot.ban.locked) {
  border-color: rgba(239, 68, 68, 0.65);
}

:deep(.draft-slot.empty) {
  opacity: 0.55;
}

:deep(.draft-slot.no-selection.locked) {
  border-style: dashed;
  opacity: 0.85;
}

:deep(.slot-top) {
  position: absolute;
  z-index: 2;
  top: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 800;
  color: white;
  text-shadow: 0 1px 2px black;
}

:deep(.hero-frame) {
  width: 112px;
  height: 112px;
  margin: 28px auto 0;
  border-radius: 12px;
  background: #111827;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

:deep(.hero-img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:deep(.draft-slot.ban .hero-img) {
  filter: grayscale(1) brightness(0.48);
}

:deep(.draft-slot.no-selection .hero-img) {
  filter: grayscale(1) brightness(0.28);
}

:deep(.hero-name) {
  padding: 8px 8px 0;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

:deep(.hero-role) {
  padding: 0 8px 8px;
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
}

.raw-card pre {
  white-space: pre-wrap;
  font-size: 12px;
  color: #d1d5db;
  margin: 0;
  padding: 12px;
}

@media (max-width: 1200px) {
  .draft-layout {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
