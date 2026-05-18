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
        <q-badge :color="isPolling ? 'positive' : 'grey-7'" :label="isPolling ? 'POLLING' : 'STOPPED'" />

        <q-btn color="primary" icon="refresh" label="Refresh" :loading="loading" @click="loadDraft" />

        <q-btn :color="isPolling ? 'negative' : 'positive'" :icon="isPolling ? 'pause' : 'play_arrow'"
          :label="isPolling ? 'Stop Polling' : 'Start Polling'" @click="isPolling ? stopPolling() : startPolling()" v-if="isViewMode === '9004'"/>

        <q-btn color="grey-8" icon="arrow_back" label="Back" @click="router.back()" />
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
              {{ xpressionDraft?.meta?.active_side }}
            </div>
          </div>

          <div>
            <div class="status-label">Completed</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.completed_steps ?? draftSlots.length }}
              /
              {{ xpressionDraft?.meta?.total_steps ?? 12 }}
            </div>
          </div>

          <div>
            <div class="status-label">Timer</div>
            <div class="status-value">
              {{ xpressionDraft?.Timer?.remaining ?? 20 }}s
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
              Viewer only — loop is controlled from Match Detail page
            </div>
          </div>
        </div>

        <div class="draft-layout">
          <div class="team-panel blue-panel">
            <div class="team-title">BLUE</div>

            <div class="phase-section">
              <div class="phase-title">Picks</div>

              <div class="slot-grid">
                <DraftSlot v-for="slot in bluePicks" :key="`blue-pick-${slot.round}-${slot.slot}`" :draft-slot="slot" />
              </div>
            </div>

            <div class="phase-section">
              <div class="phase-title">Bans</div>

              <div class="slot-grid bans">
                <DraftSlot v-for="slot in blueBans" :key="`blue-ban-${slot.round}-${slot.slot}`" :draft-slot="slot" />
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
              <div class="timer-number">{{ xpressionDraft?.Timer?.remaining ?? 20 }}</div>
              <div class="map-label">Seconds Remaining</div>
            </div>
          </div>

          <div class="team-panel red-panel">
            <div class="team-title">RED</div>

            <div class="phase-section">
              <div class="phase-title">Picks</div>

              <div class="slot-grid">
                <DraftSlot v-for="slot in redPicks" :key="`red-pick-${slot.round}-${slot.slot}`" :draft-slot="slot" />
              </div>
            </div>

            <div class="phase-section">
              <div class="phase-title">Bans</div>

              <div class="slot-grid bans">
                <DraftSlot v-for="slot in redBans" :key="`red-ban-${slot.round}-${slot.slot}`" :draft-slot="slot" />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="raw-card">
      <q-expansion-item dark dense icon="data_object" label="Debug / Raw /xpression/draft Payload">
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

const draftSlots = computed(() => xpressionDraft.value?.Draft || [])

const bluePicks = computed(() => getFixedSlots(1, "PICK"))
const blueBans = computed(() => getFixedSlots(1, "BAN"))
const redPicks = computed(() => getFixedSlots(2, "PICK"))
const redBans = computed(() => getFixedSlots(2, "BAN"))

// const bluePicks = computed(() =>
//   draftSlots.value.filter((slot) => Number(slot.camp) === 1 && slot.type === 'PICK'),
// )

// const blueBans = computed(() =>
//   draftSlots.value.filter((slot) => Number(slot.camp) === 1 && slot.type === 'BAN'),
// )

// const redPicks = computed(() =>
//   draftSlots.value.filter((slot) => Number(slot.camp) === 2 && slot.type === 'PICK'),
// )

// const redBans = computed(() =>
//   draftSlots.value.filter((slot) => Number(slot.camp) === 2 && slot.type === 'BAN'),
// )

const activeSideLabel = computed(() => {
  const meta = xpressionDraft.value?.meta || {}
  return meta.active_side || getCampLabel(meta.active_camp)
})

const mapName = computed(() => {
  const map = xpressionDraft.value?.Map || {}
  return map.map_name || map.name || '-'
})

const mapMode = computed(() => {
  const map = xpressionDraft.value?.Map || {}
  return map.map_mode || map.mode || '-'
})

// const draftSlotRules = {
//   0: { type: "BAN", camps: [1, 2] },
//   1: { type: "PICK", camp: 2 },
//   2: { type: "BAN", camp: 1 },
//   3: { type: "PICK", camp: 1 },
//   4: { type: "BAN", camp: 2 },
//   5: { type: "BAN", camps: [1, 2] },
//   6: { type: "PICK", camp: 1 },
//   7: { type: "BAN", camp: 2 },
//   8: { type: "PICK", camp: 2 },
//   9: { type: "BAN", camp: 1 },
// }

const DraftSlot = defineComponent({
  name: 'DraftSlot',
  props: {
    draftSlot: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'div',
        {
          class: [
            'draft-slot',
            props.draftSlot?.type?.toLowerCase(),
            props.draftSlot?.hero?.id ? 'locked' : 'empty',
          ],
        },
        [
          // h('div', { class: 'slot-top' }, [
          //   h('span', props.draftSlot?.slot),
          //   h('span', props.draftSlot?.type),
          // ]),

          h('div', { class: 'hero-frame' }, [
            h('img', {
              class: 'hero-img',
              src: getHeroImage(props.draftSlot?.hero),
              alt: props.draftSlot?.hero?.name || 'Hero',
              onError: (event) => {
                event.target.src = '/imgs/heroes/empty.png'
              },
            }),
          ]),

          h('div', { class: 'hero-name' }, props.draftSlot?.hero?.name || 'Hero 0'),
          h('div', { class: 'hero-role' }, props.draftSlot?.hero?.role || 'Unknown'),
        ],
      )
  },
})

function getFixedSlots(camp, type) {
  const expectedRounds = [
    { round: 0, type: "BAN", camp: 1 },
    { round: 0, type: "BAN", camp: 2 },
    { round: 1, type: "PICK", camp: 1 },
    { round: 2, type: "BAN", camp: 2 },
    { round: 3, type: "PICK", camp: 2 },
    { round: 4, type: "BAN", camp: 1 },
    { round: 5, type: "BAN", camp: 1 },
    { round: 5, type: "BAN", camp: 2 },
    { round: 6, type: "PICK", camp: 2 },
    { round: 7, type: "BAN", camp: 1 },
    { round: 8, type: "PICK", camp: 1 },
    { round: 9, type: "BAN", camp: 2 },
  ]

  return expectedRounds
    .filter((slot) => slot.camp === camp && slot.type === type)
    .map((slot, index) => {
      const found = xpressionDraft.value?.Draft?.find(
        (d) =>
          Number(d.round) === slot.round &&
          Number(d.camp) === slot.camp &&
          d.type === slot.type
      )

      return found || {
        round: slot.round,
        camp: slot.camp,
        type: slot.type,
        slot: `${camp === 1 ? "Blue" : "Red"} ${index + 1}`,
        hero: {
          id: 0,
          name: "",
          role: "",
        },
        empty: true,
      }
    })
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
  if (!id) return '/imgs/heroes/empty.png'

  const imageId = id === 10571 || id === 10572 || id === 10573 ? 1057 : id
  const name = hero?.name || `Hero ${id}`

  return `/imgs/heroes/${imageId}_${toHeroFileName(name)}.png`
}

function getCampLabel(camp) {
  if (Number(camp) === 1) return 'Blue'
  if (Number(camp) === 2) return 'Red'
  if (camp === 'BOTH') return 'Both'
  return '-'
}

// function buildDraftPlan() {
//   const first = 2
//   const second = 1

//   return {
//     rounds: [
//       { round_index: 0, phase: 'BAN', camp: 'BOTH' },
//       { round_index: 1, phase: 'PICK', camp: first },
//       { round_index: 2, phase: 'BAN', camp: second },
//       { round_index: 3, phase: 'PICK', camp: second },
//       { round_index: 4, phase: 'BAN', camp: first },
//       { round_index: 5, phase: 'BAN', camp: 'BOTH' },
//       { round_index: 6, phase: 'PICK', camp: second },
//       { round_index: 7, phase: 'BAN', camp: first },
//       { round_index: 8, phase: 'PICK', camp: first },
//       { round_index: 9, phase: 'BAN', camp: second },
//     ],
//   }
// }
function buildDraftPlan() {
  return {
    rounds: [
      { round_index: 0, phase: 'BAN', camp: 'BOTH' },
      { round_index: 1, phase: 'PICK', camp: 1 },
      { round_index: 2, phase: 'BAN', camp: 2 },
      { round_index: 3, phase: 'PICK', camp: 2 },
      { round_index: 4, phase: 'BAN', camp: 1 },
      { round_index: 5, phase: 'BAN', camp: 'BOTH' },
      { round_index: 6, phase: 'PICK', camp: 2 },
      { round_index: 7, phase: 'BAN', camp: 1 },
      { round_index: 8, phase: 'PICK', camp: 1 },
      { round_index: 9, phase: 'BAN', camp: 2 },
    ],
  }
}


function buildEmptyDraftSkeleton() {
  const plan = buildDraftPlan()
  const slotCounter = { 1: 0, 2: 0 }

  return plan.rounds.flatMap((round) => {
    const camps = round.camp === 'BOTH' ? [1, 2] : [Number(round.camp)]

    return camps.map((camp) => {
      slotCounter[camp] += 1

      return {
        round: Number(round.round_index),
        type: round.phase,
        camp,
        slot: camp === 1 ? `Blue ${slotCounter[camp]}` : `Red ${slotCounter[camp]}`,
        hero: {
          id: 0,
          name: 'Hero 0',
          role: 'Unknown',
          image: '/imgs/heroes/empty.png',
        },
      }
    })
  })
}

function buildBlankXpressionDraft() {
  return {
    Map: {},
    Timer: {
      phase_seconds: 20,
      remaining: 20,
    },
    Draft: buildEmptyDraftSkeleton(),
    meta: {
      current_round: -1,
      phase: 'BAN',
      active_camp: null,
      active_side: '-',
      completed_steps: 0,
      total_steps: 12,
    },
  }
}

async function loadDraft() {
  loading.value = true

  try {
    const response = await api.get('/xpression/draft')

    if (response.data?.Draft) {
      xpressionDraft.value = response.data
    } else {
      xpressionDraft.value = {
        ...buildBlankXpressionDraft(),
        message: response.data?.message || 'No draft payload yet',
      }
    }

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
