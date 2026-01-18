/**
 * Learning path content data for Google Cloud certification preparation.
 * Single source of truth - used by both list and detail endpoints.
 */

export interface LearningPathItemData {
  order: number;
  title: string;
  type: 'course' | 'skill_badge' | 'exam';
  description: string;
  topics: string[];
  whyItMatters: string;
}

export const LEARNING_PATH_ITEMS: LearningPathItemData[] = [
  {
    order: 1,
    title: 'A Tour of Google Cloud Hands-on Labs',
    type: 'course',
    description:
      'Get familiar with the Google Cloud Console, Cloud Shell, and basic navigation',
    topics: ['Console basics', 'IAM fundamentals', 'API management'],
    whyItMatters:
      'Foundation for all hands-on work with GCP. Understanding the console and Cloud Shell is essential for the exam.',
  },
  {
    order: 2,
    title: 'Google Cloud Fundamentals: Core Infrastructure',
    type: 'course',
    description: 'Learn about GCP resources, identity and access, and core services',
    topics: ['Resource hierarchy', 'IAM', 'Compute options', 'Storage options'],
    whyItMatters: 'Covers ~40% of exam content. Core concepts tested heavily.',
  },
  {
    order: 3,
    title: 'Essential Google Cloud Infrastructure: Foundation',
    type: 'course',
    description: 'Deep dive into VPCs, VMs, and networking fundamentals',
    topics: ['VPC networking', 'Compute Engine', 'Cloud IAM'],
    whyItMatters:
      'Networking questions are common. Understanding VPCs, subnets, and firewall rules is critical.',
  },
  {
    order: 4,
    title: 'Essential Google Cloud Infrastructure: Core Services',
    type: 'course',
    description: 'Storage, databases, and resource management',
    topics: ['Cloud Storage', 'Cloud SQL', 'Resource Manager'],
    whyItMatters:
      'Storage selection questions appear frequently. Know when to use each storage type.',
  },
  {
    order: 5,
    title: 'Elastic Google Cloud Infrastructure: Scaling and Automation',
    type: 'course',
    description: 'Load balancing, autoscaling, and infrastructure automation',
    topics: ['Load balancing', 'Autoscaling', 'Managed instance groups', 'Terraform'],
    whyItMatters:
      'Exam tests your ability to design scalable solutions. Load balancer selection is a key topic.',
  },
  {
    order: 6,
    title: 'Getting Started with Google Kubernetes Engine',
    type: 'course',
    description: 'Kubernetes fundamentals on GKE',
    topics: ['Kubernetes concepts', 'GKE clusters', 'Workloads', 'Services'],
    whyItMatters:
      'GKE questions increased in 2025 exam update. Know cluster types and workload deployment.',
  },
  {
    order: 7,
    title: 'Developing Applications with Cloud Run',
    type: 'course',
    description: 'Serverless containers with Cloud Run',
    topics: ['Cloud Run deployment', 'Container configuration', 'Traffic management'],
    whyItMatters:
      'Cloud Run is the go-to serverless option. Exam tests when to use it vs other compute options.',
  },
  {
    order: 8,
    title: 'Logging and Monitoring in Google Cloud',
    type: 'course',
    description: 'Cloud Operations suite for observability',
    topics: ['Cloud Logging', 'Cloud Monitoring', 'Error Reporting', 'Trace'],
    whyItMatters:
      'Operations questions are ~20% of exam. Know how to create metrics, alerts, and dashboards.',
  },
  {
    order: 9,
    title: 'Cloud Load Balancing Skill Badge',
    type: 'skill_badge',
    description: 'Hands-on lab for load balancing configurations',
    topics: ['HTTP(S) LB', 'Network LB', 'Internal LB', 'SSL certificates'],
    whyItMatters:
      'Practical experience with load balancer setup. Exam has scenario-based LB questions.',
  },
  {
    order: 10,
    title: 'Set Up an App Dev Environment Skill Badge',
    type: 'skill_badge',
    description: 'Configure development environments on GCP',
    topics: ['Cloud Shell', 'Cloud Code', 'Artifact Registry'],
    whyItMatters: 'Development workflow questions test your practical GCP experience.',
  },
  {
    order: 11,
    title: 'Develop your Google Cloud Network Skill Badge',
    type: 'skill_badge',
    description: 'Advanced networking configurations',
    topics: ['VPC peering', 'Shared VPC', 'Private Google Access', 'Cloud NAT'],
    whyItMatters: 'Complex networking scenarios are common. Know hybrid connectivity options.',
  },
  {
    order: 12,
    title: 'Build Infrastructure with Terraform Skill Badge',
    type: 'skill_badge',
    description: 'Infrastructure as Code with Terraform on GCP',
    topics: ['Terraform basics', 'State management', 'Modules'],
    whyItMatters:
      'IaC is increasingly important. Know Terraform basics for automated deployments.',
  },
  {
    order: 13,
    title: 'Preparing for Your Associate Cloud Engineer Exam',
    type: 'course',
    description: 'Exam preparation and practice',
    topics: ['Exam format', 'Question types', 'Time management'],
    whyItMatters: 'Final preparation. Understand the exam structure and practice strategies.',
  },
  {
    order: 14,
    title: 'Associate Cloud Engineer Certification',
    type: 'exam',
    description: 'The certification exam itself',
    topics: ['All domains covered'],
    whyItMatters: 'The goal! 50 questions, 2 hours, passing score ~70%.',
  },
];

export const LEARNING_PATH_TOTAL = LEARNING_PATH_ITEMS.length;
