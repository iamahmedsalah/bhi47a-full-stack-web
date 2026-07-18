import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  type AdvisingGraphEdgeType,
  type AdvisingGraphNodeType,
} from '../constants/advising.constants';
export interface AdvisingGraphNode {
  id: string;
  type: AdvisingGraphNodeType;
  position: { x: number; y: number };
  courseId?: string;
  label: string;
  status?: string;
  locked?: boolean;
  note?: string;
}
export interface AdvisingGraphEdge {
  id: string;
  type: AdvisingGraphEdgeType;
  source: string;
  target: string;
}
export type AdvisingGraphDocument = HydratedDocument<AdvisingGraph>;
@Schema({ collection: 'advising_graphs', timestamps: true })
export class AdvisingGraph {
  @Prop({
    type: Types.ObjectId,
    ref: 'AdvisingPlan',
    required: true,
    unique: true,
  })
  planId!: Types.ObjectId;
  @Prop({
    type: [
      {
        id: String,
        type: { type: String, enum: GRAPH_NODE_TYPES },
        position: { x: Number, y: Number },
        courseId: String,
        label: String,
        status: String,
        locked: Boolean,
        note: String,
      },
    ],
    default: [],
  })
  nodes!: AdvisingGraphNode[];
  @Prop({
    type: [
      {
        id: String,
        type: { type: String, enum: GRAPH_EDGE_TYPES },
        source: String,
        target: String,
      },
    ],
    default: [],
  })
  edges!: AdvisingGraphEdge[];
  @Prop({
    type: { x: Number, y: Number, zoom: Number },
    default: { x: 0, y: 0, zoom: 1 },
  })
  viewport!: { x: number; y: number; zoom: number };
  @Prop({ default: 1, min: 1 }) layoutVersion!: number;
}
export const AdvisingGraphSchema = SchemaFactory.createForClass(AdvisingGraph);
