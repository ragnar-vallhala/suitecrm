<?php
$configFile = '/var/www/html/data/config.php';
if (!file_exists($configFile)) {
    die("Config file not found.\n");
}
$config = include $configFile;
if (!is_array($config)) {
    die("Config is not an array.\n");
}

$config['applicationName'] = 'Navrobotec CRM';
$config['siteUrl'] = 'https://crm.navrobotec.com';

$content = "<?php\nreturn " . var_export($config, true) . ";\n";
if (file_put_contents($configFile, $content) === false) {
    die("Failed to write config.\n");
}
echo "Config updated successfully.\n";
