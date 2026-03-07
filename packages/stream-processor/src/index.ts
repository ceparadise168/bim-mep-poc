export { StreamProcessor } from './processor.js';
export type { ProcessorOptions } from './processor.js';
export { StreamConsumer, STREAM_KEY, CONSUMER_GROUP } from './stream-consumer.js';
export type { StreamConsumerOptions, ParsedSignal } from './stream-consumer.js';
export { SlidingWindowAggregator, computeAgg, computeCOP, computeEUI, computeComfortIndex } from './aggregator.js';
export type { AggWindow, AggResult } from './aggregator.js';
export { DbWriter } from './db-writer.js';
export type { DbWriterOptions, SignalRecord, AggRecord, DeviceRecord } from './db-writer.js';
export { CREATE_TABLES_SQL, CREATE_HYPERTABLES_SQL, RETENTION_POLICY_SQL } from './db-schema.js';
