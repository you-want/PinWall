import { Injectable, Logger } from '@nestjs/common';
import { Widget, WidgetStatus } from '../../entities';

/**
 * Widget 审核系统
 * - CSP 违规检测
 * - 恶意代码模式扫描
 * - Manifest 合规性校验
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /** 危险代码模式 */
  private readonly DANGEROUS_PATTERNS: Array<{
    pattern: RegExp;
    severity: 'critical' | 'warning';
    message: string;
  }> = [
    {
      pattern: /eval\s*\(/,
      severity: 'critical',
      message: 'Use of eval() detected — potential code injection risk',
    },
    {
      pattern: /new\s+Function\s*\(/,
      severity: 'critical',
      message: 'Dynamic Function constructor detected — code injection risk',
    },
    {
      pattern: /document\.write\s*\(/,
      severity: 'critical',
      message: 'document.write() detected — potential XSS vector',
    },
    {
      pattern: /innerHTML\s*=/,
      severity: 'warning',
      message: 'Direct innerHTML assignment detected — potential XSS',
    },
    {
      pattern: /\.execCommand\s*\(/,
      severity: 'warning',
      message: 'document.execCommand() usage detected',
    },
    {
      pattern: /localStorage|sessionStorage/,
      severity: 'warning',
      message: 'Direct Web Storage access — should use SDK storage API',
    },
    {
      pattern: /navigator\.clipboard/,
      severity: 'warning',
      message: 'Clipboard API access detected',
    },
    {
      pattern: /WebSocket\s*\(/,
      severity: 'warning',
      message: 'WebSocket connection detected — ensure declared in permissions',
    },
    {
      pattern: /XMLHttpRequest|\.fetch\s*\(/,
      severity: 'warning' as const,
      message:
        'Network request detected — ensure "network" permission declared',
    },
    {
      pattern: /crypto\.(?:subtle|getRandomValues)/,
      severity: 'warning',
      message: 'Web Crypto API usage detected',
    },
    {
      pattern: /navigator\.geolocation/,
      severity: 'critical',
      message: 'Geolocation access — not allowed in widgets',
    },
    {
      pattern: /navigator\.mediaDevices|getUserMedia/,
      severity: 'critical',
      message: 'Camera/microphone access — not allowed in widgets',
    },
    {
      pattern: /window\.open\s*\(/,
      severity: 'critical',
      message: 'window.open() detected — popup not allowed in widgets',
    },
    {
      pattern: /iframe|<object|<embed/,
      severity: 'critical',
      message: 'Nested iframe/object/embed not allowed in widgets',
    },
    {
      pattern: /top\.location|parent\.location|window\.top/,
      severity: 'critical',
      message: 'Top/parent frame access — sandbox escape attempt',
    },
    {
      pattern: /postMessage\s*\([^)]*\*\s*\)/,
      severity: 'warning',
      message:
        'postMessage with wildcard origin — should specify target origin',
    },
  ];

  /** 允许的 manifest 权限值 */
  private readonly VALID_PERMISSIONS = new Set([
    'storage',
    'theme',
    'notify',
    'cards',
    'events',
    'app',
    'ai',
    'system',
    'network',
    'i18n',
  ]);

  /** 必需的 manifest 字段 */
  private readonly REQUIRED_MANIFEST_FIELDS = [
    'id',
    'name',
    'version',
    'entry',
    'permissions',
    'defaultSize',
  ];

  /**
   * 审核一个 Widget：运行安全扫描 + manifest 校验
   * 返回审核结果（通过/不通过 + 问题列表）
   */
  auditWidget(widget: Widget, sourceCode?: string): AuditResult {
    const issues: AuditIssue[] = [];

    // 1. Manifest 合规性校验
    const manifestIssues = this.validateManifest(widget.manifest);
    issues.push(...manifestIssues);

    // 2. 安全扫描（如果有源码）
    if (sourceCode) {
      const securityIssues = this.scanSecurity(sourceCode);
      issues.push(...securityIssues);
    }

    // 3. 判定结果
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasWarnings = issues.some((i) => i.severity === 'warning');

    let recommendedStatus: WidgetStatus;
    if (hasCritical) {
      recommendedStatus = WidgetStatus.REJECTED;
    } else if (hasWarnings) {
      recommendedStatus = WidgetStatus.PENDING; // 需要人工审核
    } else {
      recommendedStatus = WidgetStatus.APPROVED;
    }

    const result: AuditResult = {
      widgetId: widget.id,
      widgetName: widget.name,
      recommendedStatus,
      issues,
      criticalCount: issues.filter((i) => i.severity === 'critical').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      auditedAt: new Date().toISOString(),
    };

    this.logger.log(
      `Audit complete for "${widget.name}": ${result.criticalCount} critical, ${result.warningCount} warnings → ${recommendedStatus}`,
    );

    return result;
  }

  /**
   * Manifest 合规性校验
   */
  validateManifest(manifest: Record<string, any>): AuditIssue[] {
    const issues: AuditIssue[] = [];

    if (!manifest) {
      issues.push({
        type: 'manifest',
        severity: 'critical',
        message: 'Manifest is missing or empty',
        field: 'manifest',
      });
      return issues;
    }

    // 检查必需字段
    for (const field of this.REQUIRED_MANIFEST_FIELDS) {
      if (!manifest[field]) {
        issues.push({
          type: 'manifest',
          severity: 'critical',
          message: `Required field "${field}" is missing in manifest`,
          field,
        });
      }
    }

    // 校验版本号格式
    if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      issues.push({
        type: 'manifest',
        severity: 'warning',
        message: `Version "${manifest.version}" should follow semver (x.y.z)`,
        field: 'version',
      });
    }

    // 校验 permissions
    if (Array.isArray(manifest.permissions)) {
      for (const perm of manifest.permissions) {
        if (!this.VALID_PERMISSIONS.has(perm)) {
          issues.push({
            type: 'manifest',
            severity: 'critical',
            message: `Unknown permission "${perm}" — not in allowed permission list`,
            field: 'permissions',
          });
        }
      }
    }

    // 校验 defaultSize
    if (manifest.defaultSize) {
      const { width, height } = manifest.defaultSize as {
        width: number;
        height: number;
      };
      if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        width < 100 ||
        height < 100 ||
        width > 1200 ||
        height > 800
      ) {
        issues.push({
          type: 'manifest',
          severity: 'warning',
          message:
            'defaultSize dimensions out of reasonable range (100-1200 x 100-800)',
          field: 'defaultSize',
        });
      }
    }

    // 校验 id 格式 (lowercase + hyphens)
    if (manifest.id && !/^[a-z0-9-]+$/.test(manifest.id)) {
      issues.push({
        type: 'manifest',
        severity: 'warning',
        message:
          'Widget id should only contain lowercase letters, numbers, and hyphens',
        field: 'id',
      });
    }

    return issues;
  }

  /**
   * 安全代码扫描
   */
  scanSecurity(sourceCode: string): AuditIssue[] {
    const issues: AuditIssue[] = [];

    for (const rule of this.DANGEROUS_PATTERNS) {
      const match = rule.pattern.exec(sourceCode);
      if (match) {
        const lineNum = sourceCode.substring(0, match.index).split('\n').length;
        issues.push({
          type: 'security',
          severity: rule.severity,
          message: rule.message,
          location: `line ${lineNum}`,
          snippet: match[0],
        });
      }
    }

    return issues;
  }

  /**
   * 批量审核待审队列
   */
  auditPendingQueue(widgets: Widget[]): AuditResult[] {
    const results: AuditResult[] = [];
    for (const widget of widgets) {
      const result = this.auditWidget(widget);
      results.push(result);
    }
    return results;
  }
}

/** 审核问题 */
export interface AuditIssue {
  type: 'security' | 'manifest';
  severity: 'critical' | 'warning';
  message: string;
  field?: string;
  location?: string;
  snippet?: string;
}

/** 审核结果 */
export interface AuditResult {
  widgetId: string;
  widgetName: string;
  recommendedStatus: WidgetStatus;
  issues: AuditIssue[];
  criticalCount: number;
  warningCount: number;
  auditedAt: string;
}
