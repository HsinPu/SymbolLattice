import org.springframework.beans.factory.annotation.Value;

class YamlConfig {
  @Value("${server.port}")
  private String port;
}
