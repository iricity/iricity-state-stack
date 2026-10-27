# Licence mapping example: an amateur station licence

How a national amateur radio licence becomes a `regulator_issued` authorization record. The example uses the shape of an Indian Amateur Station Operator's Certificate and licence; every numeric value below is illustrative. The authoritative bands, power limits and validity come from the licence document and the national frequency allocation, never from this page.

## 1. The parties

| Role | Identifier | Holds |
| --- | --- | --- |
| Authority (the licensing office) | a `did:key` published by the authority | the private key that issues credentials |
| Station (the licensee's node or ground station) | `subject_id`, the station's node id in the protocol | its own node key, unrelated to the credential |
| Any verifier | nothing | the authority's DID, learned once |

The authority's DID is the only thing a verifier needs. It can be published on the authority's website, in a registry identity record (`entity` with `identity_type: organization`), or handed over in person; the protocol does not say how, only that the record names it.

## 2. Field mapping

| Licence document | Authorization field | Example |
| --- | --- | --- |
| Licensee's station, as the protocol knows it | `subject_id` | `station_vu2abc` |
| Issuing authority | `controller_id` | the authority's `did:key` |
| What the licence permits | `capability` | `transmit` |
| Licence grade or class | `scope` | `amateur_general_grade` |
| Country of issue | `jurisdiction` | `IN` |
| Permitted frequency bands | `bands[]` with `lower_hz`, `upper_hz`, `service` | `144000000` to `146000000`, `amateur` |
| Maximum permitted power | `max_eirp_dbw` | `20` |
| Station location and permitted radius, when the licence fixes one | `location` | latitude, longitude, `radius_km` |
| Call sign and licence number | `license_reference` | `ASOC/EXAMPLE/0001` |
| Date of issue | `valid_from` | `2026-01-01T00:00:00.000Z` |
| Date of expiry | `valid_until` | `2031-01-01T00:00:00.000Z` |
| Who stands behind the record | `profile` | `regulator_issued` |
| The credential | `proof` | the verifiable credential below |

Power is expressed as EIRP in dBW so licences stated in watts of transmitter output, ERP or EIRP all map onto one number; the conversion is the authority's to make when it issues the credential.

## 3. Issuing

The authority runs the reference primitives once per licence:

```js
import { createRegulatorIssuedAuthorization } from '@iricity/frontier-shared';

const record = createRegulatorIssuedAuthorization({
  subject_id: 'station_vu2abc',
  capability: 'transmit',
  scope: 'amateur_general_grade',
  jurisdiction: 'IN',
  bands: [
    { lower_hz: 144000000, upper_hz: 146000000, service: 'amateur' },
    { lower_hz: 434000000, upper_hz: 438000000, service: 'amateur' }
  ],
  max_eirp_dbw: 20,
  location: { latitude: 28.6139, longitude: 77.209, radius_km: 1 },
  license_reference: 'ASOC/EXAMPLE/0001',
  valid_from: '2026-01-01T00:00:00.000Z',
  valid_until: '2031-01-01T00:00:00.000Z',
  regulator: authorityKeyPair
});
```

The result is one authorization record whose `proof` is the credential:

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2", { "@vocab": "urn:frontier-state-protocol:vocab:authorization#" }],
  "type": ["VerifiableCredential", "SpectrumAuthorizationCredential"],
  "id": "urn:frontier-state-protocol:credential:…",
  "issuer": "did:key:z6Mk…",
  "validFrom": "2026-01-01T00:00:00.000Z",
  "validUntil": "2031-01-01T00:00:00.000Z",
  "credentialSubject": {
    "id": "station_vu2abc",
    "capability": "transmit",
    "scope": "amateur_general_grade",
    "jurisdiction": "IN",
    "bands": [ { "lower_hz": 144000000, "upper_hz": 146000000, "service": "amateur" }, { "lower_hz": 434000000, "upper_hz": 438000000, "service": "amateur" } ],
    "max_eirp_dbw": 20,
    "location": { "latitude": 28.6139, "longitude": 77.209, "radius_km": 1 },
    "license_reference": "ASOC/EXAMPLE/0001"
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-jcs-2022",
    "created": "2026-01-01T00:00:00.000Z",
    "verificationMethod": "did:key:z6Mk…#z6Mk…",
    "proofPurpose": "assertionMethod",
    "proofValue": "z…"
  }
}
```

The authority hands the record to the licensee. Nothing else is published by the authority; the DID already was.

## 4. Attaching and publishing

The licensee's node adds the record to the authorizations it serves alongside its self-declared ones. Because the record is signed by the authority, not by the node, the node cannot widen it: any change to a band, the power ceiling, the dates or the subject makes the credential fail to verify. The node may still revoke its own use of it by publishing the record with `revoked: true`; the credential inside stays authentic, and `authorizationIsCurrent` answers false.

## 5. Verifying

A registry on ingest, or any party at any time:

```js
import { verifyAuthorizationCredential, authorizationIsCurrent } from '@iricity/frontier-shared';

verifyAuthorizationCredential(record);                  // authentic and bound to the record?
authorizationIsCurrent(record, new Date());             // in force right now?
```

The first answers whether the authority really issued exactly this; the second whether it applies today. A scheduler that would transmit on a band checks both, and the band in question, before it acts.

## 6. What this does not do

- It does not make the protocol an authority. The credential is only as good as the DID behind it; who to trust is a decision the verifier makes.
- It does not encode every clause of a licence. Conditions that are not bands, power, place, time or scope stay in the licence document, referenced by `license_reference`.
- It does not replace the authority's own registry. It lets a machine prove, offline, that a specific grant exists and what it says.
