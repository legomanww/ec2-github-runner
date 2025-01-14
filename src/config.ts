import { getInput, getBooleanInput, warning as logWarning } from '@actions/core';
import { context } from '@actions/github';
import { TagSpecification, VolumeType, _InstanceType } from '@aws-sdk/client-ec2';

export interface ConfigInterface {
  githubToken: string;
}

class Config implements ConfigInterface {
  githubToken: string;

  constructor() {
    this.githubToken = getInput('github-token');
  }

  generateUniqueLabel(): string {
    return Math.random().toString(36).substring(2, 7);
  }

  getStringOrUndefined(name: string): string | undefined {
    const val = getInput(name);
    if (val === '') {
      return undefined;
    }
    return val;
  }

  getBooleanOrUndefined(name: string): boolean | undefined {
    const val = getInput(name);
    if (val === '') {
      return undefined;
    }
    return getBooleanInput(name);
  }

  getTypeOrUndefined<T>(name: string): T | undefined {
    const val = getInput(name);
    if (val === '') {
      return undefined;
    }
    return val as T;
  }

  getIntOrUndefined(name: string): number | undefined {
    const val = getInput(name);
    if (val === '') {
      return undefined;
    }
    try {
      return Number.parseInt(val);
    } catch {
      logWarning(`Could not convert ${name}'s provided value of ${val} to an integer.`);
      return undefined;
    }
  }

  getFloatOrUndefined(name: string): number | undefined {
    const val = getInput(name);
    if (val === '') {
      return undefined;
    }
    try {
      return Number.parseFloat(val);
    } catch {
      logWarning(`Could not convert ${name}'s provided value of ${val} to a floating point number.`);
      return undefined;
    }
  }
}

export class StartConfig extends Config {
  awsIamRoleName: string | undefined;
  awsKeyPairName: string | undefined;

  githubToken: string;
  githubRepo: string;
  githubOwner: string;
  githubActionRunnerVersion: string;
  githubActionRunnerLabel: string;
  githubRunnerHomeDir: string;
  githubRunnerPreRunnerScript: string;

  ec2InstanceId: string;
  ec2MaxRetries: number;
  ec2Os: string;
  ec2AmiId: string;
  ec2SecurityGroupId: string;
  ec2SubnetId: string;
  ec2InstanceType: _InstanceType;
  ec2InstanceTags: TagSpecification[] | undefined;
  ec2UseSpot: boolean | undefined;
  ec2StorageSize: number | undefined;
  ec2StorageIops: number | undefined;
  ec2StorageType: VolumeType | undefined;
  ec2StorageThroughput: number | undefined;
  ec2StorageDeviceName: string | undefined;
  ec2AssociatePublicIp: boolean | undefined;

  constructor() {
    super();
    this.githubToken = getInput('github-token');
    this.githubRepo = context.repo.repo;
    this.githubOwner = context.repo.owner;
    this.githubActionRunnerVersion = getInput('runner-version');
    this.githubActionRunnerLabel = this.getStringOrUndefined('label') || this.generateUniqueLabel();
    this.githubRunnerHomeDir = getInput('runner-home-dir');
    this.githubRunnerPreRunnerScript = getInput('pre-runner-script');

    this.ec2InstanceId = getInput('ec2-instance-id');
    this.ec2MaxRetries = this.getIntOrUndefined('max-retries') || 1;
    const instanceType = this.getTypeOrUndefined<_InstanceType>('ec2-instance-type');
    this.ec2InstanceType = instanceType || _InstanceType.t3_micro; // do this separately so it can be verified
    this.ec2Os = getInput('ec2-os');
    this.ec2AmiId = getInput('ec2-image-id');
    this.ec2SecurityGroupId = getInput('security-group-id');
    this.ec2SubnetId = getInput('subnet-id');
    this.ec2UseSpot = this.getBooleanOrUndefined('spot');
    this.ec2StorageSize = this.getFloatOrUndefined('volume-size');
    this.ec2StorageIops = this.getIntOrUndefined('volume-iops');
    this.ec2StorageType = this.getTypeOrUndefined<VolumeType>('volume-type');
    this.ec2StorageThroughput = this.getIntOrUndefined('volume-throughput');
    this.ec2StorageDeviceName = this.getStringOrUndefined('volume-device-name');
    this.ec2AssociatePublicIp = this.getBooleanOrUndefined('associate-public-ip');

    this.awsIamRoleName = this.getStringOrUndefined('iam-role-name');
    this.awsKeyPairName = this.getStringOrUndefined('aws-key-pair-name');

    const tags = JSON.parse(getInput('aws-resource-tags'));
    this.ec2InstanceTags = undefined;
    if (tags.length > 0) {
      this.ec2InstanceTags = [
        { ResourceType: 'instance', Tags: tags },
        { ResourceType: 'volume', Tags: tags },
      ];
    }

    //
    // validate input
    //
    if (this.githubToken === '') {
      throw new Error(`The 'github-token' is required but was not specified`);
    }
    if (this.ec2AmiId === '' || instanceType === undefined || this.ec2Os === '' || this.ec2SubnetId === '' || this.ec2SecurityGroupId === '') {
      throw new Error(`Not all the required inputs are provided for the 'start' mode`);
    }
    if (this.ec2StorageSize !== undefined && (this.ec2StorageDeviceName === undefined)) {
      throw new Error('Must specify a volume device name if a size is specified');
    }
    if (this.ec2Os !== 'windows' && this.ec2Os !== 'linux') {
      throw new Error(`Invalid ec2-os. Allowed values: 'windows' or 'linux'.`);
    }
  }
}

export class StopConfig extends Config {
  githubToken: string;
  githubActionRunnerLabel: string;
  ec2InstanceId: string;

  constructor() {
    super();
    this.githubToken = getInput('github-token');
    this.githubActionRunnerLabel = getInput('label');
    this.ec2InstanceId = getInput('ec2-instance-id');

    //
    // validate input
    //
    if (this.githubToken === '') {
      throw new Error(`The 'github-token' is required but was not specified`);
    }

    if (this.githubActionRunnerLabel === '') {
      throw new Error(`The 'label' is required but was not specified`);
    }

    if (this.ec2InstanceId === '') {
      throw new Error(`The 'ec2-instance-id' is required but was not specified`);
    }
  }
}
