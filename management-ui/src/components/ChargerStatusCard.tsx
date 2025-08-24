import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Spin, Tag, Typography } from "antd";
import { ThunderboltOutlined, PoweroffOutlined, ClockCircleOutlined, SettingOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface MeterValues {
  timestamp: string;
  connectorId: number;
  transactionId: number;
  context: string;
  data: {
    "Current.Offered": number;
    "Current.Import.L1": number;
    "Current.Import.L2": number;
    "Current.Import.L3": number;
    "Voltage.L1": number;
    "Voltage.L2": number;
    "Voltage.L3": number;
    "Energy.Active.Import.Register": number;
    "Power.Active.Import": number;
  };
  chargingProfile?: {
    name: string;
    currentMaxPower: number;
  };
}

const ChargerStatusCard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [meterValues, setMeterValues] = useState<MeterValues | null>(null);
  const [stationStatus, setStationStatus] = useState<'available' | 'charging' | 'unknown'>('unknown');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchMeterValues();
    
    // Set up 10-second refresh interval
    const interval = setInterval(() => {
      fetchMeterValues();
    }, 10000);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  const fetchMeterValues = async () => {
    try {
      const response = await fetch('/meter_values.json');
      if (response.ok) {
        const data: MeterValues = await response.json();
        setMeterValues(data);
        setLastUpdateTime(new Date());
        
        // Check if the file was updated recently (within 2 minutes)
        const fileTimestamp = new Date(data.timestamp);
        const now = new Date();
        const timeDiff = now.getTime() - fileTimestamp.getTime();
        const twoMinutes = 2 * 60 * 1000; // 2 minutes in milliseconds
        
        if (timeDiff < twoMinutes) {
          setStationStatus('charging');
        } else {
          setStationStatus('available');
        }
      } else {
        setStationStatus('unknown');
      }
    } catch (error) {
      console.error("Error fetching meter values:", error);
      setStationStatus('unknown');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'charging':
        return 'green';
      case 'available':
        return 'blue';
      case 'unknown':
        return 'orange';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'charging':
        return <ThunderboltOutlined />;
      case 'available':
        return <PoweroffOutlined />;
      case 'unknown':
        return <ClockCircleOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'charging':
        return 'Charging';
      case 'available':
        return 'Available';
      case 'unknown':
        return 'Unknown';
      default:
        return 'Unknown';
    }
  };

  if (loading) {
    return (
      <Card size={isMobile ? "small" : "default"} title="Charger Status">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <p>Loading charger status...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      size={isMobile ? "small" : "default"} 
      title={
        <span>
          <SettingOutlined style={{ marginRight: 8 }} />
          Charger Status
        </span>
      }
    >
      <Row gutter={isMobile ? 8 : 16}>
        <Col xs={24} sm={12}>
          <Tag 
            color={getStatusColor(stationStatus)} 
            style={{ 
              fontSize: '16px', 
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {getStatusIcon(stationStatus)}
            {getStatusText(stationStatus)}
          </Tag>
        </Col>
        
        <Col xs={24} sm={12}>
          <Statistic
            title="Current Power"
            value={meterValues?.data["Power.Active.Import"] || 0}
            precision={2}
            suffix="kW"
            prefix={<ThunderboltOutlined />}
            valueStyle={{ color: '#3f8600' }}
          />
        </Col>
      </Row>

      {meterValues?.chargingProfile && (
        <Row gutter={isMobile ? 8 : 16} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12}>
            <Statistic
              title="Profile Name"
              value={meterValues.chargingProfile.name}
              prefix={<SettingOutlined />}
            />
          </Col>
          
          <Col xs={24} sm={12}>
            <Statistic
              title="Max Power Limit"
              value={meterValues.chargingProfile.currentMaxPower}
              precision={1}
              suffix="A"
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
        </Row>
      )}

      {meterValues && (
        <Row gutter={isMobile ? 8 : 16} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Statistic
              title="Energy Imported"
              value={meterValues.data["Energy.Active.Import.Register"] || 0}
              precision={2}
              suffix="kWh"
            />
          </Col>
        </Row>
      )}

      {lastUpdateTime && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary">
            Last updated: {lastUpdateTime.toLocaleTimeString()}
          </Text>
        </div>
      )}
    </Card>
  );
};

export default ChargerStatusCard;
