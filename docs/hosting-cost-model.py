"""Planning estimates, USD/month, researched 2026-09-10.

Run: python3 docs/hosting-cost-model.py
Rates, sources, topology, exclusions, and allowances: stack-and-hosting-research.md.
This is a sizing model, not a provider quote. No cloud resources are created.
"""
import json

HOURS = 730
FARGATE_CPU_SECOND = 0.000011244
FARGATE_GIB_SECOND = 0.000001235


def serverless(seconds, memory_rate):
    # 1 vCPU / 2 GiB; aggregate web + worker billed allocation time.
    return max(seconds - 180_000, 0) * 0.000024 + max(
        2 * seconds - 360_000, 0
    ) * memory_rate


def fargate(cpu, gib, seconds):
    return seconds * (cpu * FARGATE_CPU_SECOND + gib * FARGATE_GIB_SECOND)


def estimate():
    # Same 20–25 users and baseline capacity during pilot and launch.
    # Workload inputs are provisional; user count alone does not size jobs.
    seconds = 50_000
    disk = 32
    gcp_cpu, gcp_ram = 1, 3.75
    gcp_backup = 10
    aws_web_cpu, aws_web_ram = 0.5, 1
    aws_worker_seconds = 30_000
    # Explicit allowances, not exact provider SKU calculations.
    gcp_misc = 10
    azure_misc = 15
    aws_misc = 10
    alb_lcu = 0.1
    result = {
        "Google Cloud": {
            "database_and_backup": HOURS * (gcp_cpu * 0.0413 + gcp_ram * 0.007)
            + disk * 0.17 + gcp_backup * 0.08,
            "web_and_worker": serverless(seconds, 0.0000025),
            "supporting_services_allowance": gcp_misc,
            "transactional_email": 20,
        },
        "Azure": {
            "database_and_backup": 12.41 + disk * 0.115,
            "web_and_worker": serverless(seconds, 0.000003),
            "supporting_services_allowance": azure_misc,
            "transactional_email": 20,
        },
        "AWS": {
            "database_and_backup": HOURS * 0.032 + disk * 0.115,
            "web_and_worker": fargate(aws_web_cpu, aws_web_ram, HOURS * 3600)
            + fargate(1, 2, aws_worker_seconds),
            "load_balancer": HOURS * (0.0225 + alb_lcu * 0.008),
            "public_ipv4": 3 * HOURS * 0.005,
            "supporting_services_allowance": aws_misc,
            "transactional_email": 20,
        },
    }
    for values in result.values():
        values["monthly_total"] = sum(values.values())
        values["annual_at_constant_usage"] = 12 * values["monthly_total"]
    return {cloud: {k: round(v, 2) for k, v in values.items()}
            for cloud, values in result.items()}


if __name__ == "__main__":
    print(json.dumps({"active_users_both_stages": "20–25", "pilot": estimate(), "launch_same_workload": estimate()}, indent=2))
