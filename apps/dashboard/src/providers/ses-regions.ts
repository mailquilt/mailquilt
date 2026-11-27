/**
 * The AWS Regions SES sends from, as AWS names them, in the order of its
 * endpoints table (https://docs.aws.amazon.com/general/latest/gr/ses.html,
 * read 2026-11-27).
 */
export const SES_REGIONS = [
  { code: "us-east-2", name: "US East (Ohio)" },
  { code: "us-east-1", name: "US East (N. Virginia)" },
  { code: "us-west-1", name: "US West (N. California)" },
  { code: "us-west-2", name: "US West (Oregon)" },
  { code: "af-south-1", name: "Africa (Cape Town)" },
  { code: "ap-south-2", name: "Asia Pacific (Hyderabad)" },
  { code: "ap-southeast-3", name: "Asia Pacific (Jakarta)" },
  { code: "ap-southeast-5", name: "Asia Pacific (Malaysia)" },
  { code: "ap-southeast-4", name: "Asia Pacific (Melbourne)" },
  { code: "ap-south-1", name: "Asia Pacific (Mumbai)" },
  { code: "ap-southeast-6", name: "Asia Pacific (New Zealand)" },
  { code: "ap-northeast-3", name: "Asia Pacific (Osaka)" },
  { code: "ap-northeast-2", name: "Asia Pacific (Seoul)" },
  { code: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
  { code: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
  { code: "ap-east-2", name: "Asia Pacific (Taipei)" },
  { code: "ap-southeast-7", name: "Asia Pacific (Thailand)" },
  { code: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
  { code: "ca-central-1", name: "Canada (Central)" },
  { code: "ca-west-1", name: "Canada West (Calgary)" },
  { code: "eu-central-1", name: "Europe (Frankfurt)" },
  { code: "eu-west-1", name: "Europe (Ireland)" },
  { code: "eu-west-2", name: "Europe (London)" },
  { code: "eu-south-1", name: "Europe (Milan)" },
  { code: "eu-west-3", name: "Europe (Paris)" },
  { code: "eu-south-2", name: "Europe (Spain)" },
  { code: "eu-north-1", name: "Europe (Stockholm)" },
  { code: "eu-central-2", name: "Europe (Zurich)" },
  { code: "il-central-1", name: "Israel (Tel Aviv)" },
  { code: "mx-central-1", name: "Mexico (Central)" },
  { code: "me-south-1", name: "Middle East (Bahrain)" },
  { code: "sa-east-1", name: "South America (São Paulo)" },
  { code: "us-gov-east-1", name: "AWS GovCloud (US-East)" },
  { code: "us-gov-west-1", name: "AWS GovCloud (US-West)" },
] as const;

/** A Region as a person reads it, such as "Europe (Ireland), eu-west-1"; a code AWS hasn't named here is shown as it is. */
export const sesRegionLabel = (code: string) => {
  const region = SES_REGIONS.find((candidate) => candidate.code === code);

  return region === undefined ? code : `${region.name}, ${code}`;
};
