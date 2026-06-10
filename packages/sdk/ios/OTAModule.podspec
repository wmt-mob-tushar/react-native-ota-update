Pod::Spec.new do |s|
  s.name         = 'OTAModule'
  s.version      = '1.0.0'
  s.summary      = 'OTA Platform native iOS module'
  s.homepage     = 'https://github.com/your-org/ota-platform'
  s.license      = { :type => 'MIT' }
  s.author       = { 'OTA Platform' => 'ota@example.com' }
  s.platform     = :ios, '13.0'
  s.source       = { :path => '.' }
  s.source_files = '*.{h,m}'
  s.requires_arc = true

  s.dependency 'React-Core'
end
