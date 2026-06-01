const baseRecord = {
  type: 'object',
  required: ['record_type'],
  properties: {
    record_type: { type: 'string' }
  }
};

export const schemas = {
  entity: {
    ...baseRecord,
    required: ['record_type', 'entity_id', 'entity_type', 'created_at'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'entity' },
      entity_id: { type: 'string' },
      entity_type: { type: 'string' },
      created_at: { type: 'string' }
    }
  },
  authorization: {
    ...baseRecord,
    required: ['record_type', 'subject_id', 'controller_id', 'capability'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'authorization' },
      subject_id: { type: 'string' },
      controller_id: { type: 'string' },
      capability: { type: 'string' }
    }
  },
  time: {
    ...baseRecord,
    required: ['record_type', 'timestamp'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'time' },
      timestamp: { type: 'string' }
    }
  },
  navigation: {
    ...baseRecord,
    required: ['record_type', 'entity_id', 'timestamp'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'navigation' },
      entity_id: { type: 'string' },
      timestamp: { type: 'string' }
    }
  },
  measurement: {
    ...baseRecord,
    required: ['record_type', 'sensor_id', 'measurement_type', 'timestamp'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'measurement' },
      sensor_id: { type: 'string' },
      measurement_type: { type: 'string' },
      timestamp: { type: 'string' }
    }
  },
  communication: {
    ...baseRecord,
    required: ['record_type', 'message_id', 'source_node', 'destination_node', 'timestamp'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'communication' },
      message_id: { type: 'string' },
      source_node: { type: 'string' },
      destination_node: { type: 'string' },
      timestamp: { type: 'string' }
    }
  },
  command: {
    ...baseRecord,
    required: ['record_type', 'command_id', 'issuer', 'target'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'command' },
      command_id: { type: 'string' },
      issuer: { type: 'string' },
      target: { type: 'string' }
    }
  },
  resource: {
    ...baseRecord,
    required: ['record_type', 'resource_type', 'quantity', 'unit'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'resource' },
      resource_type: { type: 'string' },
      quantity: { type: 'number' },
      unit: { type: 'string' }
    }
  },
  constraint: {
    ...baseRecord,
    required: ['record_type', 'constraint_id', 'constraint_type'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'constraint' },
      constraint_id: { type: 'string' },
      constraint_type: { type: 'string' }
    }
  },
  conversion: {
    ...baseRecord,
    required: ['record_type', 'source_system', 'source_format', 'raw_record_hash', 'normalized_record_hash'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'conversion' },
      source_system: { type: 'string' },
      source_format: { type: 'string' },
      raw_record_hash: { type: 'string' },
      normalized_record_hash: { type: 'string' }
    }
  },
  transition: {
    ...baseRecord,
    required: ['record_type', 'transition_id', 'subject_id', 'from_state', 'to_state'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'transition' },
      transition_id: { type: 'string' },
      subject_id: { type: 'string' },
      from_state: { type: 'string' },
      to_state: { type: 'string' }
    }
  },
  receipt: {
    ...baseRecord,
    required: ['record_type', 'receipt_id', 'record_hash', 'timestamp'],
    properties: {
      ...baseRecord.properties,
      record_type: { const: 'receipt' },
      receipt_id: { type: 'string' },
      record_hash: { type: 'string' },
      timestamp: { type: 'string' }
    }
  }
};

