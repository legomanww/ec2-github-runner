import { GithubUtils } from "./gh";
import { Config, ConfigInterface } from './config';
import * as core from "@actions/core";
import { AwsUtils } from './aws';

function setOutput(label: string, ec2InstanceId: string) {
  core.setOutput('label', label);
  core.setOutput('ec2-instance-id', ec2InstanceId);
}

async function start(config: ConfigInterface) {
  const gh = new GithubUtils(config);
  const aws = new AwsUtils(config);

  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const ec2InstanceId = await aws.startEc2Instance(githubRegistrationToken);
  if (!ec2InstanceId)
  {
    core.error("Could not get EC2 Instance ID");
    core.setFailed("Could not get EC2 Instance ID");
    return;
  }
  setOutput(label, ec2InstanceId);
  await aws.waitForInstanceRunning(ec2InstanceId);
  await gh.waitForRunnerRegistered(label);
}

async function stop(config: ConfigInterface) {
  const gh = new GithubUtils(config);
  const aws = new AwsUtils(config);

  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

(async function () {
  try {
    const config: ConfigInterface = new Config();
    if (config.actionMode === 'start') {
      await start(config);
    }
    else {
      await stop(config);
    }
  } catch (error) {
    if (error instanceof Error){
      core.error(error);
      core.setFailed(error.message);
    }
    core.error("Unknown error occurred");
  }
})();
