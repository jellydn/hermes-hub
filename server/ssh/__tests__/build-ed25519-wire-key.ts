export function buildEd25519WireKey(): Buffer {
	const algoName = Buffer.from("ssh-ed25519", "ascii");
	const algoLength = Buffer.alloc(4);
	algoLength.writeUInt32BE(algoName.length, 0);

	const keyMaterial = Buffer.alloc(32, 0xab);
	const keyLength = Buffer.alloc(4);
	keyLength.writeUInt32BE(keyMaterial.length, 0);

	return Buffer.concat([algoLength, algoName, keyLength, keyMaterial]);
}
