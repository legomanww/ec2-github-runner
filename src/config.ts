import * as core from "@actions/core";
import * as github from "@actions/github";
import { TagSpecification, VolumeType } from '@aws-sdk/client-ec2';
import { _InstanceType } from '@aws-sdk/client-ec2/dist-types/models/models_0';

export interface ConfigInterface {
  actionMode: string;

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
  ec2InstanceType: _InstanceType;
  ec2Os: string;
  ec2AmiId: string;
  ec2InstanceTags: TagSpecification[] | undefined;
  ec2SecurityGroupId: string;
  ec2SubnetId: string;
  ec2MarketType: string | undefined;
  ec2StorageSize: number | undefined;
  ec2StorageIops: number | undefined;
  ec2StorageType: VolumeType | undefined;
  ec2StorageThroughput: number | undefined;
  generateUniqueLabel: () => string;
}

export class Config implements ConfigInterface {
  actionMode: string;

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
  ec2InstanceType: _InstanceType;
  ec2Os: string;
  ec2AmiId: string;
  ec2InstanceTags: TagSpecification[] | undefined;
  ec2SecurityGroupId: string;
  ec2SubnetId: string;
  ec2MarketType: string | undefined;
  ec2StorageSize: number | undefined;
  ec2StorageIops: number | undefined;
  ec2StorageType: VolumeType | undefined;
  ec2StorageThroughput: number | undefined;

  constructor() {
    this.actionMode = core.getInput('mode');

    this.awsIamRoleName = core.getInput('iam-role-name');
    // TODO: core.getInput() returns an empty string if not defined, need to make it go to `undefined`
    this.awsKeyPairName = core.getInput('aws-key-pair-name');

    this.githubToken = core.getInput('github-token');
    this.githubRepo = github.context.repo.repo;
    this.githubOwner = github.context.repo.owner;
    this.githubActionRunnerVersion = core.getInput('runner-version');
    this.githubActionRunnerLabel = core.getInput('label');
    this.githubRunnerHomeDir = core.getInput('runner-home-dir');
    this.githubRunnerPreRunnerScript = core.getInput('pre-runner-script');

    this.ec2InstanceId = core.getInput('ec2-instance-id');
    this.ec2MaxRetries = Number.parseInt(core.getInput('max-retries'));
    this.ec2InstanceType = core.getInput('ec2-instance-type') as _InstanceType;
    this.ec2Os = core.getInput('ec2-os');
    this.ec2AmiId = core.getInput('ec2-image-id');
    this.ec2SecurityGroupId = core.getInput('security-group-id');
    this.ec2SubnetId = core.getInput('subnet-id');
    this.ec2MarketType = core.getInput('market-type');
    this.ec2StorageSize = Number.parseFloat(core.getInput('volume-size'));
    this.ec2StorageIops = Number.parseInt(core.getInput('volume-iops'));
    this.ec2StorageType = core.getInput('volume-type') as VolumeType;
    this.ec2StorageThroughput = Number.parseInt(core.getInput('volume-throughput'));

    const tags = JSON.parse(core.getInput('aws-resource-tags'));
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

    if (!this.actionMode) {
      throw new Error(`The 'mode' input is not specified`);
    }

    if (!this.githubToken) {
      throw new Error(`The 'github-token' input is not specified`);
    }

    if (this.actionMode === 'start') {
      if (!this.ec2AmiId || !this.ec2InstanceType || !this.ec2Os || !this.ec2SubnetId || !this.ec2SecurityGroupId) {
        throw new Error(`Not all the required inputs are provided for the 'start' mode`);
      }
      if (this.ec2Os !== 'windows' && this.ec2Os !== 'linux') {
        throw new Error(`Wrong ec2-os. Allowed values: windows or linux.`);
      }
      if (this.ec2MarketType?.length > 0 && this.ec2MarketType !== 'spot') {
        throw new Error(`Invalid 'market-type' input. Allowed values: spot.`);
      }
    } else if (this.actionMode === 'stop') {
      if (!this.githubActionRunnerLabel || !this.ec2InstanceId) {
        throw new Error(`Not all the required inputs are provided for the 'stop' mode`);
      }
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.');
    }
  }

  generateUniqueLabel() : string {
    return Math.random().toString(36).substring(2, 7);
  }
}
