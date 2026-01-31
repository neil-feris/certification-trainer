export const GCP_SERVICE_CATEGORIES = [
  {
    id: 'compute',
    name: 'Compute',
    services: ['Compute Engine', 'GKE', 'Cloud Run', 'Cloud Functions', 'App Engine'],
  },
  {
    id: 'storage',
    name: 'Storage & Databases',
    services: [
      'Cloud Storage',
      'Cloud SQL',
      'Cloud Spanner',
      'Firestore',
      'Bigtable',
      'Memorystore',
      'Filestore',
    ],
  },
  {
    id: 'networking',
    name: 'Networking',
    services: [
      'VPC',
      'Cloud Load Balancing',
      'Cloud CDN',
      'Cloud DNS',
      'Cloud Armor',
      'Cloud NAT',
      'Cloud Interconnect',
    ],
  },
  {
    id: 'analytics',
    name: 'Data & Analytics',
    services: ['BigQuery', 'Dataflow', 'Dataproc', 'Pub/Sub', 'Data Fusion', 'Composer'],
  },
  {
    id: 'ai-ml',
    name: 'AI & ML',
    services: ['Vertex AI', 'Vision AI', 'Natural Language', 'Translation', 'AutoML'],
  },
  {
    id: 'security',
    name: 'Security & Identity',
    services: ['IAM', 'Secret Manager', 'KMS', 'Security Command Center', 'Binary Authorization'],
  },
  {
    id: 'operations',
    name: 'Operations',
    services: ['Cloud Monitoring', 'Cloud Logging', 'Error Reporting', 'Cloud Trace'],
  },
] as const;

export type GcpCategoryId = (typeof GCP_SERVICE_CATEGORIES)[number]['id'];

export type MasteryLevel = 'none' | 'low' | 'medium' | 'high';

export interface ServiceMastery {
  id: string;
  name: string;
  category: string;
  categoryId: GcpCategoryId;
  questionsAttempted: number;
  totalQuestions: number;
  correctCount: number;
  accuracy: number | null;
  masteryLevel: MasteryLevel;
  lastAttemptAt: string | null;
}

export interface MasteryCategory {
  id: GcpCategoryId;
  name: string;
  services: ServiceMastery[];
}

export interface MasteryMapResponse {
  categories: MasteryCategory[];
  totals: {
    servicesAttempted: number;
    servicesTotal: number;
    overallAccuracy: number | null;
  };
}

export function toServiceId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function getMasteryLevel(accuracy: number | null): MasteryLevel {
  if (accuracy === null) return 'none';
  if (accuracy < 50) return 'low';
  if (accuracy < 80) return 'medium';
  return 'high';
}
