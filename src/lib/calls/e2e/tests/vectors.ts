// Auto-extracted from tdlib/tde2e/test/* — DO NOT EDIT by hand
// Source files: EncryptionTestVectors.h, encryption.cpp, blockchain.cpp, e2e.cpp

export type VectorBytes = string; // hex-encoded

// Message encryption vectors from EncryptionTestVectors.h
// These test encrypt_data_with_deterministic_padding + encrypt_header operations
export const MESSAGE_ENCRYPTION_VECTORS = [
  {
    name: 'empty_message',
    sourceFile: 'EncryptionTestVectors.h:26-29',
    inputs: {
      payload: '',
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra: '' as VectorBytes
    },
    expected: {
      encrypted_payload:
        'd28eb3e3d1328f06dafedabd67a353d5ea6e164d2f34c162a16f8a1164663a03' as VectorBytes,
      encrypted_header: '4060edd7bcacca6dd0f4fe81d6ec63a8859fa9d520598043bc4748919f3fdeda' as VectorBytes
    }
  },
  {
    name: 'simple_message',
    sourceFile: 'EncryptionTestVectors.h:30-33',
    inputs: {
      payload: '48656c6c6f2c20576f726c6421' as VectorBytes,
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra: '' as VectorBytes
    },
    expected: {
      encrypted_payload:
        '967f5245b03e07ab7be6044174306a4af811e96708ae3ad2ab427aa5495508b1c319ca0353531c0a2921e307f2455856' as VectorBytes,
      encrypted_header: '9e7910949e526b6ad51a59aad8022c826b00f379e28592ed3216aabc6be252e0' as VectorBytes
    }
  },
  {
    name: 'long_message',
    sourceFile: 'EncryptionTestVectors.h:34-45',
    inputs: {
      payload:
        '7878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878787878' as VectorBytes,
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra: '' as VectorBytes
    },
    expected: {
      encrypted_payload:
        '8202a46a19de7111166f6c244127c84dbdc1c3a63ca6526dc699c6cbbc6f8236ee82a0172ed1115cb4a2ba8e27cfa8089822c7e9070ec2f5c7cee77cc979447c1db9758119ad28a05b2edfc1c98b486985bb60fb6f1fefb4b5f7ecea19d59b8018f865a7be3771c7f6fe6092b34b78a1bddefc8d07f2f61351a4247c41a58cb068ebe9110245de4fda076f0ff73aede4e9811678424f648b8054b921b53f0612dfbdb7173a86bce3eba73955afef435599ae34825d295e8d298d6d3a1fc07084740c0b1c3a24cebedbd26b631cbbd1a352c1a499ba3576a628a74ab14eb1d180e5af7e9eac4020b889fafc4f7bfb2e24' as VectorBytes,
      encrypted_header:
        '641620351a1e4d76711385d5cf3b0eed07308c9cafc06ef09ed0c1f57ebb5f42' as VectorBytes
    }
  },
  {
    name: 'random_message',
    sourceFile: 'EncryptionTestVectors.h:46-52',
    inputs: {
      payload:
        'fed306c137017ab008c22d1f74bc104e5138d3c19b42fb303c768b083912a1102d06ac1e0f4440e3b32b9144a50e6fc0f190273bd4dec7ef847bf7d46680bb67' as VectorBytes,
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra: '736d616c6c206578747261' as VectorBytes
    },
    expected: {
      encrypted_payload:
        'ee198e4860c888ab18bcecba5083eb539f402be1fbde51e0c49e398145d40ebb7b5a52bdc83d6200e63a70c47cc6a5e6fa7a71f6e24b722b5f0314b6b52768dbd2e438a582d1cf2a54d4de7ba30e36e68afd8379b63a345483dbcc33380fd07f' as VectorBytes,
      encrypted_header:
        'f282da8a41f17a5fa7f793c6c134c5bb2b960a2fea43bdc15b58a69cb7dafb43' as VectorBytes
    }
  },
  {
    name: 'very_long_message',
    sourceFile: 'EncryptionTestVectors.h:53-74',
    inputs: {
      payload:
        'd16554889d83850ffb42d119e0c69d8b68ee07ff021f0a2cb7beb70d0b1cc62e3d8fe2dff95e674893393b5da015a965108c785d8935a3ee58e3df9505016020b558687ee535f9bcfa94450ded18ac3e8145879af43e66eeacfee1d9f9c9c78824cf34639af50fb0b93de73aa9362cf2732e2d8c652111ec1246c8ded3b19e93d154d04cc8a4bd927332136d7627e71e6be2c97dd62235dfd998d1e630588d10beeab791e09199bfa8bab3b9e6dbcdfba9f9dd76110f7f6c7fd1fbccc421e7ad093e8fd385e53e3c03f7f0a79296962de1e752eea5f8c5e6325ef406aef562d8ef0b9431defeb46fb93ee3c3409af0e3a4f7e63af4efbfb5f4b61a104c1158247877a28f9538d6cf8c5e243ece977cc2a0a0bcf602cd16df445cb71a4f6a0494a3b6a1149725c169dc40eb10' as VectorBytes,
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra:
        'ebc6b1176ca69b8bb769bcc68add44fbba1c79d2771ef412eccad3ee4f7afe595f8fd2052f8d1d8b8fea209c568eb6a4c6aea6d88c583df25ed3f38260c2f95c1f0244219d55e658498b34f7e7a527c60723b6806fe28275337b0c9b64c158825a3c14d8cec6a40bbf8c5a5a8009ca75f2c6f2e7f3ab612ff5d675f2c3b801d4d4e0408b49d8543d8621de0df26a65a49d1fc7a21584d5495a24b2090479870e852766f6de34b724e5941097d19153f4f4d035ae0c978ec6354ba452cf465581cd4afd7045bfa4c54383796587d19e981da220cd9ca5230161eaf64d8a1b406a2f8afc7faeb0ec7634c3c14aa63736c955b56c48c61ba58b109775ac252f3837e8bcebdb40f4ca2ce32609619b0063cb421a268f80c60ffc7c99963f74033d22283a6d2ab3095f65cb49a17e' as VectorBytes
    },
    expected: {
      encrypted_payload:
        'c96e7fadcf4e51f5c0dc03aeed33352d7f984c2d49791d173caad17d724b98155ff6b3dc6e082b90063434e9f85941c085dd8573fb4f23dd0867615249e8e8c567ba74d4e6739919c46afc0a6b19b26c0e37e1810952dcb859b8a2df9ed322da89c4e7821166939809d2561980ff77d3b797f1ecb1ed78e39614e096c72bed4587ac3229929ae4e164da9b00323410f8b17abed5cc8455656ee73114119e20b529294f8c578f7f9492327ff40f9f1255abe84f7445c87c8b048e98eac746f6d58fb3261f61eb039e5e88da46c9fc5e35baeb0c1180e9913f49ab7aac5f5976be1e384071470d80ddbf77c52e781f954d77978697cf555d1586469ce21ccd45f43283eeec3b976d6bd897f436ef9ccacde5da73f298bd1b99c10e988befeb2988f8f03f96215a746590d35ff0a6a85fa1102d63a00cd71e3cb80753bfe98bf6744f2aec697993dab51cce21f823656870' as VectorBytes,
      encrypted_header:
        '97b6b5b2082a66182783c0be6940ca9d63e931195b6cc84dbf9158e9b39834ac' as VectorBytes
    }
  },
  {
    name: 'message_with_special_chars',
    sourceFile: 'EncryptionTestVectors.h:75-80',
    inputs: {
      payload: '2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f' as VectorBytes,
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra: '' as VectorBytes
    },
    expected: {
      encrypted_payload:
        'b862c41221e3242c07c375dfded48e302aaebed7fbc91bbfe3b7c88345a58d3a13d83cfb87f08250b2d66f4590b5dd2bb2b08fabd4328d104f7b4e1bad80931c' as VectorBytes,
      encrypted_header:
        '7557d10f233e47a56f74a57458b5169e8cce5c4c98e3a3da02f6e49a3db4c2b3' as VectorBytes
    }
  },
  {
    name: 'message_with_unicode',
    sourceFile: 'EncryptionTestVectors.h:81-84',
    inputs: {
      payload: '48656c6c6f2c20e4b896e7958c21' as VectorBytes,
      secret: 'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c' as VectorBytes,
      extra: '' as VectorBytes
    },
    expected: {
      encrypted_payload:
        'cb0d460ca3daf8e3fd5623965b39b5c1de840e92d39f6caf4662b7a7983c53b29fe644bf45acea2644507ac01f0617a2' as VectorBytes,
      encrypted_header:
        'ebe8636326b11d90f9a670e63086e2fcd02b78c0aa5cacdb4f887e511d1ae4c9' as VectorBytes
    }
  }
];

// Ed25519 handshake/ECDH vectors from e2e.cpp
export const HANDSHAKE_VECTORS = [
  {
    name: 'pregenerated_ed25519_keys',
    sourceFile: 'e2e.cpp:120-134',
    inputs: {
      alice_public_key: 'RvG0CT5i8D-CYnfhp2akVC1tPRBIw-4X6ZqNBjH-mZI' as VectorBytes, // base64url
      alice_private_key: '8NZGWKfRCJfiks74RG9_xHmYydarLiRsoq8VcJGPglg' as VectorBytes, // base64url
      bob_public_key: '1V3BGwmbo-Mwsw7QlWKN4OZFPBP9z9VhFlZKRdzTrGw' as VectorBytes, // base64url
      bob_private_key: 'YMGoowtnZ99roUM2y5JRwiQrwGaNJ-ZRE5boy-l4aHg' as VectorBytes // base64url
    },
    expected: {
      shared_secret: 'CU6NsPBw59neM9crFvxKELbtKgAkI7G8tDHsb4CmyVA' as VectorBytes // base64url
    }
  }
];

// Blockchain validation test cases from blockchain.cpp
// These are structural validation tests with specific block configurations
export const BLOCKCHAIN_VECTORS = [
  {
    name: 'zero_block_empty_group_state',
    sourceFile: 'blockchain.cpp:18-30',
    description:
      'Valid zero block (height=0, empty_hash) with group state containing single user with all permissions',
    inputs: {
      height: 0,
      block_hash: '' as VectorBytes,
      group_state_users: 1,
      external_permissions: true
    },
    expected: {
      valid: true
    }
  },
  {
    name: 'zero_block_group_state_in_proof_only',
    sourceFile: 'blockchain.cpp:31-40',
    description: 'Valid zero block with group state only in proof (requires changes)',
    inputs: {
      height: 0,
      block_hash: '' as VectorBytes,
      has_value_change: true,
      group_state_only_in_proof: true,
      external_permissions: 0
    },
    expected: {
      valid: true
    }
  },
  {
    name: 'zero_block_invalid_height',
    sourceFile: 'blockchain.cpp:42-50',
    description: 'Invalid: zero block with height=1 instead of 0',
    inputs: {
      height: 1,
      block_hash: '' as VectorBytes,
      group_state_users: 1
    },
    expected: {
      valid: false,
      error_code: 'InvalidBlock_HeightMismatch' as VectorBytes
    }
  },
  {
    name: 'zero_block_invalid_hash',
    sourceFile: 'blockchain.cpp:52-60',
    description: 'Invalid: zero block with non-empty hash',
    inputs: {
      height: 0,
      block_hash: '01' as VectorBytes,
      group_state_users: 1
    },
    expected: {
      valid: false,
      error_code: 'InvalidBlock_HashMismatch' as VectorBytes
    }
  },
  {
    name: 'zero_block_invalid_signature',
    sourceFile: 'blockchain.cpp:62-71',
    description: 'Zero block with corrupted/invalid signature',
    inputs: {
      height: 0,
      block_hash: '' as VectorBytes,
      has_invalid_signature: true
    },
    expected: {
      valid: false,
      error_code: 'InvalidBlock_InvalidSignature' as VectorBytes
    }
  },
  {
    name: 'group_state_no_permissions_remove',
    sourceFile: 'blockchain.cpp:156-166',
    description: 'Cannot remove user without proper permissions',
    inputs: {
      operation: 'remove_user',
      actor_has_permission: false
    },
    expected: {
      valid: false,
      error_code: 'InvalidBlock_NoPermissions' as VectorBytes
    }
  }
];

// Call/handshake integration tests from e2e.cpp
export const CALL_VECTORS = [
  {
    name: 'qr_handshake_basic',
    sourceFile: 'e2e.cpp:152-166',
    description: 'QR handshake flow: Bob creates start, Alice responds accept, Bob finishes',
    inputs: {
      alice_user_id: 123,
      bob_user_id: 321,
      use_qr: true
    },
    expected: {
      completes_successfully: true
    }
  },
  {
    name: 'check_shared_secret_basic',
    sourceFile: 'e2e.cpp:168-179',
    description: 'Commitment+reveal nonce flow for shared secret verification',
    inputs: {
      parties: 2
    },
    expected: {
      hash_agreement: true
    }
  }
];

// Type export for test vector metadata
export type TestVector = {
  name: string;
  sourceFile: string;
  description?: string;
  inputs: Record<string, any>;
  expected: Record<string, any>;
};
