import { getInput, getBooleanInput, warning as logWarning } from '@actions/core';
import { context } from '@actions/github';
import { TagSpecification, VolumeType, _InstanceType } from '@aws-sdk/client-ec2';

class Config {
  github: {
    token: string;
  };

  constructor() {
    this.github = { token: getInput('github-token') };
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
  github: {
    token: string;
    repo: string;
    owner: string;
    actionRunnerVersion: string;
    actionRunnerLabel: string;
    runnerHomeDir: string;
    runnerPreRunnerScript: string;
    registrationTimeoutInMinutes: number;
  };

  ec2: {
    instanceId: string;
    maxRetries: number;
    os: string;
    amiId: string;
    securityGroupId: string;
    subnetId: string;
    instanceType: _InstanceType;
    instanceTags: TagSpecification[] | undefined;
    useSpot: boolean | undefined;
    storageSize: number | undefined;
    storageIops: number | undefined;
    storageType: VolumeType | undefined;
    storageThroughput: number | undefined;
    storageDeviceName: string | undefined;
    associatePublicIp: boolean;
  };

  aws: {
    iamRoleName: string | undefined;
    keyPairName: string | undefined;
  };

  constructor() {
    super();
    this.github = {
      token: getInput('github-token'),
      repo: context.repo.repo,
      owner: context.repo.owner,
      actionRunnerVersion: getInput('runner-version'),
      actionRunnerLabel: this.getStringOrUndefined('label') || this.generateUniqueLabel(),
      runnerHomeDir: getInput('runner-home-dir'),
      runnerPreRunnerScript: getInput('pre-runner-script'),
      registrationTimeoutInMinutes: this.getFloatOrUndefined('registration-timeout') || 5,
    };

    const tags = JSON.parse(getInput('aws-resource-tags'));

    this.ec2 = {
      instanceId: getInput('ec2-instance-id'),
      maxRetries: this.getIntOrUndefined('max-retries') || 1,
      os: getInput('ec2-os'),
      amiId: getInput('ec2-image-id'),
      securityGroupId: getInput('security-group-id'),
      subnetId: getInput('subnet-id'),
      instanceType: this.getTypeOrUndefined<_InstanceType>('ec2-instance-type') || _InstanceType.t3_micro,
      instanceTags: (tags.length > 0) ? [{ ResourceType: 'instance', Tags: tags }, { ResourceType: 'volume', Tags: tags }] : undefined,
      useSpot: this.getBooleanOrUndefined('spot'),
      storageSize: this.getFloatOrUndefined('volume-size'),
      storageIops: this.getIntOrUndefined('volume-iops'),
      storageType: this.getTypeOrUndefined<VolumeType>('volume-type'),
      storageThroughput: this.getIntOrUndefined('volume-throughput'),
      storageDeviceName: this.getStringOrUndefined('volume-device-name'),
      associatePublicIp: this.getBooleanOrUndefined('associate-public-ip') || true,
    };

    this.aws = {
      iamRoleName: this.getStringOrUndefined('iam-role-name'),
      keyPairName: this.getStringOrUndefined('aws-key-pair-name'),
    };

    //
    // validate input
    //
    if (this.github.token === '') {
      throw new Error(`The 'github-token' is required but was not specified`);
    }
    if (this.github.registrationTimeoutInMinutes <= 0) {
      throw new Error(`The 'registration-timeout' must be a positive number`);
    }
    if (this.ec2.amiId === '' || this.ec2.instanceType === undefined || this.ec2.os === '' || this.ec2.subnetId === '' || this.ec2.securityGroupId === '') {
      throw new Error(`Not all the required inputs are provided for the 'start' mode`);
    }
    if (this.ec2.storageSize !== undefined && (this.ec2.storageDeviceName === undefined)) {
      throw new Error('Must specify a volume device name if a size is specified');
    }
    if (this.ec2.os !== 'windows' && this.ec2.os !== 'linux') {
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
