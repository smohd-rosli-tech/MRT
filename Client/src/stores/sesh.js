// src/stores/sesh.js
import { defineStore } from 'pinia'
import { socket } from 'boot/socket'

export const useSeshStore = defineStore('sesh', {
  state: () => ({
    room: '120001',
    region: 'GLOBAL',
    isTestMatch: false
  }),

  actions: {
    initSocket() {
      if (socket) {
        socket.off('room:sync')

        socket.on('room:sync', (val) => {
          this.room = val
        })

        socket.on('region:sync', (val) => {
          this.region = val
        })

        socket.on('testMatch:sync', (val) => {
          this.isTestMatch = val
        })
      } else {
        console.warn('[SeshStore] Socket not available in initSocket')
      }
    },

    updateRoom(val) {
      this.room = val
      socket.emit('room:update', val)
    },

    updateRegion(val) {
      this.region = val
      socket.emit('region:update', val)
    },

    updateTestMatch(val) {
      this.isTestMatch = val
      socket.emit('testMatch:update', val)
    },

    disconnect() {
      if (socket) {
        socket.disconnect()
      }
    },
  },
})
