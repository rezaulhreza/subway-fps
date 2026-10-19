// Station dimensions in metres. Track runs along x; the platform is on the -z side.
export const L = {
  HALF: 55, // platform half length
  BACK_Z: -7, // platform back wall face
  EDGE_Z: 0, // platform edge
  FAR_Z: 4.2, // wall face across the track
  TRACK_Y: -1.25, // top of ballast
  RAIL_Y: -1.01, // top of rail
  TRACK_Z: 1.6, // track centreline
  WALL_TOP: 3.2, // springing line of the vault
  VAULT_ZC: -1.4,
  VAULT_A: 5.6,
  VAULT_B: 3.2,
  TUN_R: 3.0,
  TUN_CY: 1.0,
  TUN_LEN: 520,
  STAIRS: [-22, 22],
  STAIR_HW: 1.6, // stair corridor half width
  STAIR_TOP: 4.0,
  STAIR_Z0: -7.6,
  STAIR_Z1: -16,
  STAIR_END: -24,
  TRUNK_Z: -3.5, // light trunking line
};

export function vaultY(z) {
  const t = (z - L.VAULT_ZC) / L.VAULT_A;
  return L.WALL_TOP + L.VAULT_B * Math.sqrt(Math.max(0, 1 - t * t));
}
