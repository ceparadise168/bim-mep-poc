import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

const signalEnvelopeSchema = {
  type: 'object',
  required: ['signalId', 'deviceId', 'timestamp', 'protocol', 'payload', 'quality'],
  properties: {
    signalId: { type: 'string', minLength: 1 },
    deviceId: { type: 'string', pattern: '^[A-Z]{2,4}-\\d{2}F-\\d{3}$' },
    timestamp: { type: 'number', minimum: 1000000000000 }, // must be ms
    protocol: { type: 'string', enum: ['modbus-tcp', 'bacnet-ip', 'mqtt', 'opcua', 'restful'] },
    payload: { type: 'object', minProperties: 1 },
    quality: { type: 'string', enum: ['good', 'uncertain', 'bad'] },
    metadata: { type: 'object' },
  },
  additionalProperties: false,
};

const validate = ajv.compile(signalEnvelopeSchema);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateSignal(signal: unknown): ValidationResult {
  const valid = validate(signal);
  if (valid) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: validate.errors?.map(e => `${e.instancePath} ${e.message}`) ?? ['Unknown validation error'],
  };
}

export { signalEnvelopeSchema };
