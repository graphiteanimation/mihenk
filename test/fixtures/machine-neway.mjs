// Test sabiti: kullanici tezgah profili ornegi (urun icinde yerlesik DEGIL; K-026). ornekler/tezgahlar/ dosyasiyla ayni icerik.
export const NEWAY_FIXTURE = {
  "id": "user-neway-vm1160h-m80v-gsa",
  "name": "Neway VM1160H · M80V · GSA A",
  "rev": 1,
  "control": "mitsubishi-m80v",
  "axes": {
    "X": {
      "travel": 1000,
      "min": null,
      "max": null
    },
    "Y": {
      "travel": 600,
      "min": null,
      "max": null
    },
    "Z": {
      "travel": 600,
      "min": null,
      "max": null
    },
    "A": {
      "kind": "rotary",
      "about": "X",
      "dir": [
        -1,
        0,
        0
      ],
      "limits": null,
      "shortest": true,
      "rapid": 4000,
      "feedMax": 2000,
      "centerHeight": 160,
      "clamp": {
        "lock": "M10",
        "unlock": "M11",
        "output": false
      }
    }
  },
  "spindle": {
    "maxRpm": null,
    "minRpm": null
  },
  "feed": {
    "maxCut": null,
    "rapid": null
  },
  "toolChange": {
    "maxTools": null,
    "kind": "random",
    "pos": null
  },
  "protected": {
    "T": [
      1,
      3,
      12
    ],
    "H": [
      1,
      3,
      12
    ],
    "D": [
      1,
      3,
      12
    ],
    "wcs": [
      "G54",
      "G56"
    ],
    "noteKey": "cam.machine.protected_confirm"
  },
  "table": {
    "x": 1200,
    "y": 600
  },
  "post": {
    "props": {
      "safeRetract": null,
      "safeRetractZ": null,
      "dwellAddress": null,
      "dwellUnit": null,
      "cycleDwellAddress": null,
      "cycleDwellUnit": null,
      "coolantCodes": {
        "flood": "M8",
        "mist": null,
        "air": null,
        "through": null,
        "off": "M9"
      },
      "g541Range": null,
      "tapMode": "pitch",
      "rigidTapM": null,
      "tapR1": true,
      "rotaryMode": "6a",
      "aSplit180": true,
      "highSpeedOn": null,
      "highSpeedOff": null
    }
  }
};
