export type EncryptedSecretEntry = {
	encrypted: string;
	last4: string;
};

export type EncryptedSecretMap = Record<string, EncryptedSecretEntry>;
