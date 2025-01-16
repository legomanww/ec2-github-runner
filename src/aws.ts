import {
  BlockDeviceMapping,
  EC2Client,
  InstanceMarketOptionsRequest,
  InstanceNetworkInterfaceSpecification,
  RunInstancesCommand,
  RunInstancesCommandInput,
  TerminateInstancesCommand,
  waitUntilInstanceRunning,
} from '@aws-sdk/client-ec2';
import * as core from '@actions/core';
import { StartConfig } from './config';
import { GithubUtils } from './gh';

export class AwsUtils {
  config: StartConfig;

  constructor(config: StartConfig) {
    this.config = config;
  }

  // User data scripts are run as the root user
  async buildUserDataScript(githubRegistrationToken: string, githubToken: string): Promise<string[]> {
    core.info(`Building data script for ${this.config.ec2.os}`);
    const gh: GithubUtils = new GithubUtils(githubToken);
    const runnerVersion = await gh.getRunnerVersion(this.config);

    if (this.config.ec2.os === 'windows') {
      const ret: string[] = [
        '<powershell>',
        'winrm quickconfig -q',
        `winrm set winrm/config/service/Auth '@{Basic="true"}'`,
        `winrm set winrm/config/service '@{AllowUnencrypted="true"}'`,
        `winrm set winrm/config/winrs '@{MaxMemoryPerShellMB="0"}'`,
      ];

      // go to home dir
      if (this.config.github.runnerHomeDir !== '') {
        ret.push(`mkdir ${this.config.github.runnerHomeDir}; cd "${this.config.github.runnerHomeDir}"`);
      } else {
        ret.push('mkdir c:\\a; cd c:\\a');
      }

      if (this.config.github.runnerPreRunnerScript !== '') {
        // add pre-runner script
        ret.push(
          `echo "${this.config.github.runnerPreRunnerScript}" > pre-runner-script.ps1`,
          '& pre-runner-script.ps1',
        );
      }

      if (this.config.github.actionRunnerVersion !== 'none') {
        // install actions-runner software
        ret.push(
          '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
          `Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-win-x64-${runnerVersion}.zip -OutFile actions-runner-win-x64-${runnerVersion}.zip`,
          `Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-${runnerVersion}.zip", "$PWD")`,
        );
      }

      // start actions-runner software
      ret.push(
        // Name the instance the same as the label to avoid machine name conflicts in GitHub.
        `./config.cmd --url https://github.com/${this.config.github.owner}/${this.config.github.repo} --token ${githubRegistrationToken} --labels ${this.config.github.actionRunnerLabel} --name ${this.config.github.actionRunnerLabel} --unattended`,
        './run.cmd',
        '</powershell>',
        '<persist>false</persist>',
      );

      return ret;
    } else if (this.config.ec2.os === 'linux') {
      const ret: string[] = [
        '#!/bin/bash',
        'export RUNNER_ALLOW_RUNASROOT=1',
        'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      ];

      // go to home dir
      if (this.config.github.runnerHomeDir !== '') {
        ret.push(
          `mkdir -p "${this.config.github.runnerHomeDir}"`,
          `cd "${this.config.github.runnerHomeDir}"`,
        );
      } else {
        ret.push(
          'mkdir -p /a',
          'cd /a',
        );
      }

      if (this.config.github.runnerPreRunnerScript !== '') {
        // add pre-runner script
        ret.push(
          `echo "${this.config.github.runnerPreRunnerScript}" > pre-runner-script.sh`,
          'source pre-runner-script.sh',
        );
      }

      if (this.config.github.actionRunnerVersion !== 'none') {
        // install actions-runner software
        ret.push(
          `curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-linux-$ARCH-${runnerVersion}.tar.gz`,
          `tar xzf ./actions-runner.tar.gz`,
        );
      }

      // start actions-runner software
      ret.push(
        `./config.sh --url https://github.com/${this.config.github.owner}/${this.config.github.repo} --token ${githubRegistrationToken} --labels ${this.config.github.actionRunnerLabel} --name ${this.config.github.actionRunnerLabel} --unattended`,
        './run.sh',
      );

      return ret;
    } else {
      core.error(`Unsupported ec2-os: ${this.config.ec2.os}`);
      return [];
    }
  }

  buildMarketOptions(): InstanceMarketOptionsRequest | undefined {
    if (this.config.ec2.useSpot) {
      return {
        MarketType: 'spot',
        SpotOptions: {
          SpotInstanceType: 'one-time',
        },
      };
    }

    return undefined;
  }

  buildBlockMappings(): BlockDeviceMapping[] | undefined {
    if (this.config.ec2.storageSize === undefined
      && this.config.ec2.storageIops === undefined
      && this.config.ec2.storageType === undefined
      && this.config.ec2.storageThroughput === undefined) {
      return undefined;
    }

    return [
      {
        DeviceName: this.config.ec2.storageDeviceName,
        Ebs: {
          DeleteOnTermination: true,
          VolumeSize: this.config.ec2.storageSize,
          Iops: this.config.ec2.storageIops,
          VolumeType: this.config.ec2.storageType,
          Throughput: this.config.ec2.storageThroughput,
        },
      },
    ];
  }

  buildKeyConfig(): string | undefined {
    if (this.config.aws.keyPairName === undefined
      || this.config.aws.keyPairName === '') {
      return undefined;
    }

    return this.config.aws.keyPairName;
  }

  buildNetworkConfig(): InstanceNetworkInterfaceSpecification[] | undefined {
    return [
      {
        DeviceIndex: 0,
        AssociatePublicIpAddress: this.config.ec2.associatePublicIp,
        SubnetId: this.config.ec2.subnetId,
        Groups: [this.config.ec2.securityGroupId],
      },
    ];
  }

  async startEc2Instance(githubRegistrationToken: string, githubToken: string): Promise<string | undefined> {
    const client = new EC2Client();

    const userData = await this.buildUserDataScript(githubRegistrationToken, githubToken);

    const params: RunInstancesCommandInput = {
      ImageId: this.config.ec2.amiId,
      InstanceType: this.config.ec2.instanceType,
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userData.join('\n')).toString('base64'),
      IamInstanceProfile: { Name: this.config.aws.iamRoleName },
      KeyName: this.buildKeyConfig(),
      TagSpecifications: this.config.ec2.instanceTags,
      InstanceMarketOptions: this.buildMarketOptions(),
      BlockDeviceMappings: this.buildBlockMappings(),
      NetworkInterfaces: this.buildNetworkConfig(),
    };

    const maxRetries = this.config.ec2.maxRetries;
    let retryCount = 0;

    core.group('AWS Run Instance params', async () => {
      core.info(JSON.stringify(params, null, 2));
    });

    while (retryCount < maxRetries) {
      core.info(`Starting AWS EC2 instance... (Attempt ${retryCount}/${maxRetries})`);

      try {
        const command = new RunInstancesCommand(params);
        const result = await client.send(command);
        if (result.Instances?.length === 1) {
          const ec2InstanceId = result.Instances[0].InstanceId;
          core.info(`AWS EC2 instance ${ec2InstanceId} has started`);
          return ec2InstanceId;
        }
      } catch (error) {
        core.error('AWS EC2 instance starting error');
        core.group('AWS EC2 instance starting error details', async () => {
          core.info(JSON.stringify(error));
        });
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error;
        }
        core.warning(`Retrying... (Attempt ${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30-second pause
      }
    }
  }

  static async terminateEc2Instance(ec2InstanceId: string): Promise<void> {
    const client = new EC2Client();

    const params = {
      InstanceIds: [ec2InstanceId],
    };

    const command = new TerminateInstancesCommand(params);

    try {
      await client.send(command);
      core.info(`AWS EC2 instance ${ec2InstanceId} has terminated`);
    } catch (error) {
      core.error(`AWS EC2 instance ${ec2InstanceId} termination error`);
      throw error;
    }
  }

  static async waitForInstanceRunning(ec2InstanceId: string): Promise<void> {
    const client = new EC2Client();

    const params = {
      InstanceIds: [ec2InstanceId],
    };

    try {
      await waitUntilInstanceRunning({ client, maxWaitTime: 30, minDelay: 3 }, params);
      core.info(`AWS EC2 instance ${ec2InstanceId} is up and running`);
    } catch (error) {
      core.error(`AWS EC2 instance ${ec2InstanceId} initialization error`);
      throw error;
    }
  }
}
